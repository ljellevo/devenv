import { spawn, type ChildProcess } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { createInterface } from 'node:readline';
import { exec, quote } from './process';
export interface WslDistribution { name: string; version: number }
export function parseDistributions(output: string): WslDistribution[] {
  return output.replaceAll('\0', '').replace(/^\uFEFF/, '').split(/\r?\n/).flatMap(line => {
    const match = line.trim().replace(/^\*\s*/, '').match(/^(.+?)\s{2,}\S+\s+(\d+)\s*$/);
    return match ? [{ name: match[1], version: Number(match[2]) }] : [];
  });
}
export function wslUNC(value: string): { distribution: string; path: string } | undefined {
  const match = value.match(/^\\\\(?:wsl\$|wsl\.localhost)\\([^\\]+)(?:\\(.*))?$/i);
  return match ? { distribution: match[1], path: '/' + (match[2] ?? '').replaceAll('\\', '/') } : undefined;
}
export function explorerPath(distribution: string, path: string): string {
  if (!path.startsWith('/') || /[\\\0]/.test(path) || !distribution || /[\\/\0]/.test(distribution)) throw new Error('Invalid WSL path');
  return `\\\\wsl.localhost\\${distribution}${path.replaceAll('/', '\\')}`;
}
export async function distributions(): Promise<WslDistribution[]> {
  if (process.platform !== 'win32') throw new Error('WSL selection requires Windows.');
  try {
    const { stdout } = await exec('wsl.exe', ['--list', '--verbose'], { encoding: 'buffer', timeout: 15000 });
    return parseDistributions(stdout.toString(stdout.includes(0) ? 'utf16le' : 'utf8'));
  } catch (error) { throw new Error(`Could not discover WSL. Install WSL 2 and a distribution. ${String(error)}`); }
}
export async function requireDistribution(name: string) {
  const distribution = (await distributions()).find(item => item.name === name);
  if (!distribution) throw new Error(`WSL distribution '${name}' is unavailable or was removed.`);
  if (distribution.version !== 2) throw new Error(`'${name}' uses WSL ${distribution.version}; WSL 2 is required.`);
}
export async function translatePath(distribution: string, path: string) {
  const { stdout } = await exec('wsl.exe', ['--distribution', distribution, '--exec', 'wslpath', '-a', '-u', path], { timeout: 10000 });
  const translated = stdout.trim();
  if (!translated.startsWith('/')) throw new Error('WSL could not translate this path. Check the selected distribution and mounts.');
  return translated;
}
export class WslClient extends EventEmitter {
  private child?: ChildProcess;
  private sequence = 0;
  private pending = new Map<number, { resolve(value: any): void; reject(error: Error): void }>();
  private ready?: Promise<void>;
  runtimeDirectory = '';
  constructor(readonly distribution: string, private archive: string, private version: string) { super(); }
  // A failed or lost companion is started again on the next request; its journal recovers the previous session.
  connect(): Promise<void> {
    if (!this.ready) { const ready = this.ready = this.start(); ready.catch(() => { if (this.ready === ready) this.ready = undefined; }); }
    return this.ready;
  }
  private async start() {
    await requireDistribution(this.distribution);
    if (!/^\d+\.\d+\.\d+$/.test(this.version)) throw new Error('Invalid companion version');
    const archive = await translatePath(this.distribution, this.archive);
    const relative = `.local/share/devenv/companion/${this.version}`;
    const provision = `set -eu; base="$HOME/${relative}"; test -r ${quote(archive)} || { echo 'Companion archive is inaccessible; check Windows drive mounts' >&2; exit 1; }; if ! test -f "$base/.complete"; then staging="$base.install-$$"; mkdir -p "$staging"; trap 'rm -rf -- "$staging"' EXIT; tar -xzf ${quote(archive)} -C "$staging"; test -x "$staging/bin/node"; test -f "$staging/supervisor.cjs"; touch "$staging/.complete"; rm -rf -- "$base"; mv "$staging" "$base"; fi; printf '%s' "$base"`;
    const result = await exec('wsl.exe', ['--distribution', this.distribution, '--exec', '/bin/sh', '-c', provision], { timeout: 120000 });
    this.runtimeDirectory = result.stdout.trim();
    if (!this.runtimeDirectory.startsWith('/')) throw new Error('Companion provisioning did not return an absolute path');
    const command = `exec ${quote(this.runtimeDirectory + '/bin/node')} ${quote(this.runtimeDirectory + '/supervisor.cjs')} --stdio "$HOME/.local/share/devenv/supervisor" "${'$'}{SHELL:-/bin/bash}"`;
    const child = this.child = spawn('wsl.exe', ['--distribution', this.distribution, '--exec', '/bin/sh', '-c', command], { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
    let diagnostic = '';
    child.stderr!.on('data', chunk => { diagnostic = (diagnostic + chunk.toString()).slice(-8000); });
    await new Promise<void>((resolve, reject) => {
      let failed = false;
      const timer = setTimeout(() => { child.stdin?.end(); fail(new Error('WSL companion initialization timed out')); }, 30000);
      const fail = (error: Error) => {
        if (failed) return; failed = true;
        clearTimeout(timer); reject(error);
        if (this.child === child) { this.child = undefined; this.ready = undefined; }
        for (const request of this.pending.values()) request.reject(error); this.pending.clear(); this.emit('failure', error);
      };
      child.once('error', fail);
      child.once('exit', code => fail(new Error(`WSL companion exited (${code}). ${diagnostic}`.trim())));
      createInterface({ input: child.stdout! }).on('line', line => {
        // wsl.exe can print notices on stdout; only JSON objects belong to the protocol.
        if (!line.trimStart().startsWith('{')) { diagnostic = (diagnostic + line + '\n').slice(-8000); return; }
        try {
          const data = JSON.parse(line);
          if (data.event === 'ready') { clearTimeout(timer); resolve(); }
          else if (data.event === 'fatal') fail(new Error(data.error));
          else if (data.id) { const request = this.pending.get(data.id); this.pending.delete(data.id); data.error ? request?.reject(new Error(data.error)) : request?.resolve(data.value); }
          else this.emit('message', data);
        } catch { fail(new Error('Invalid WSL companion response')); child.stdin?.end(); }
      });
    });
  }
  async request<T = void>(method: string, value?: string): Promise<T> {
    await this.connect();
    if (!this.child?.stdin?.writable) throw new Error('WSL companion disconnected. Retry to reconnect.');
    return new Promise<T>((resolve, reject) => {
      const id = ++this.sequence;
      this.pending.set(id, { resolve, reject });
      this.child!.stdin!.write(JSON.stringify({ id, method, value }) + '\n', error => { if (error) { this.pending.delete(id); reject(error); } });
    });
  }
  async close() {
    if (!this.child || this.child.exitCode !== null || this.child.signalCode) return;
    await this.request('install-cancel'); await this.request('stop');
    const child = this.child;
    if (child && child.exitCode === null) await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('WSL companion did not finish shutdown')), 30000);
      child.once('exit', () => { clearTimeout(timer); resolve(); }); child.stdin?.end();
    });
  }
}
