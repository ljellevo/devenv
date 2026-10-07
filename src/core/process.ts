import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { platform, encodedPowerShell, defaultShell, ownedCommand, jobExecutable } from './platform';
import { spawn, execFile, execFileSync, type ChildProcess } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile } from 'node:fs/promises';
import { parse } from 'dotenv';
import type { ServiceConfig } from '../shared/types';

const execFileAsync = promisify(execFile);
// The supervisor and GUI have no console; without windowsHide every Windows query would flash a console window.
export const exec = ((file: string, args?: readonly string[], options?: object) => execFileAsync(file, args, { windowsHide: true, ...options })) as typeof execFileAsync;
export const delay = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));
export const message = (error: unknown) => error instanceof Error ? error.message : String(error);
export const quote = (value: string) => "'" + value.replaceAll("'", "'\\''") + "'";

export async function shellEnvironment(shell: string): Promise<NodeJS.ProcessEnv> {
  const marker = '__DEVENV_ENV_8F21__';
  if (platform === 'windows') {
    const { stdout } = await exec(shell, encodedPowerShell(`Write-Output '${marker}'; [Environment]::GetEnvironmentVariables('Process') | ConvertTo-Json -Compress`).filter(arg => arg !== '-NoProfile'), { timeout: 10000, maxBuffer: 1024 * 1024 });
    const offset = stdout.lastIndexOf(marker);
    if (offset < 0) throw new Error('Could not read PowerShell environment');
    const env = { ...process.env, ...JSON.parse(stdout.slice(offset + marker.length).trim()) };
    delete env.ELECTRON_RUN_AS_NODE; delete env.NODE_OPTIONS; return env;
  }
  const { stdout } = await exec(shell, ['-ilc', `printf '${marker}\\0'; /usr/bin/env -0`], { timeout: 10000, maxBuffer: 1024 * 1024 });
  const offset = stdout.indexOf(marker + '\0');
  if (offset < 0) throw new Error('Could not read shell environment');
  const env: NodeJS.ProcessEnv = { ...process.env };
  for (const entry of stdout.slice(offset + marker.length + 1).split('\0')) {
    const split = entry.indexOf('=');
    if (split > 0) env[entry.slice(0, split)] = entry.slice(split + 1);
  }
  delete env.ELECTRON_RUN_AS_NODE;
  delete env.NODE_OPTIONS;
  return env;
}

export async function serviceEnvironment(service: ServiceConfig, base: NodeJS.ProcessEnv) {
  const fileEnv = service.env_file ? parse(await readFile(service.env_file)) : {};
  return { ...base, ...fileEnv, ...service.env, DEVENV_SERVICE: service.name };
}

export function launch(command: string, cwd: string, shell: string, env: NodeJS.ProcessEnv, retainBackground = false): ChildProcess {
  const [file, args] = ownedCommand(shell, command);
  const statusDirectory = platform === 'windows' && retainBackground ? mkdtempSync(join(tmpdir(), 'devenv-job-')) : undefined;
  const statusFile = statusDirectory && join(statusDirectory, 'exit');
  if (statusFile) args.splice(1, 0, '--background', statusFile);
  const child = spawn(file, args, { cwd, env, windowsHide: true, detached: platform !== 'windows', stdio: ['ignore', 'pipe', 'pipe'] });
  if (statusFile) {
    const timer = setInterval(() => {
      try {
        const match = readFileSync(statusFile, 'utf8').trim().match(/^exit=(\d+)$/);
        if (match) { clearInterval(timer); child.emit('command-exit', Number(match[1]), null); }
      } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') { clearInterval(timer); child.emit('error', error); } }
    }, 25);
    timer.unref();
    const cleanup = () => { clearInterval(timer); rmSync(statusDirectory!, { recursive: true, force: true }); };
    child.once('exit', cleanup); child.once('error', cleanup);
  }
  return child;
}

export interface ProcessIdentity { pid: number; pgid: number; ppid: number; started: string; command: string }
export async function processes(): Promise<ProcessIdentity[]> {
  if (platform === 'windows') {
    const { stdout } = await exec(await defaultShell(), encodedPowerShell(`@(Get-CimInstance Win32_Process | ForEach-Object { @{ pid = [int]$_.ProcessId; pgid = [int]$_.ProcessId; ppid = [int]$_.ParentProcessId; started = if ($_.CreationDate) { $_.CreationDate.ToUniversalTime().ToString('o') } else { '' }; command = [string]$_.CommandLine } }) | ConvertTo-Json -Compress`), { timeout: 10000, maxBuffer: 16 * 1024 * 1024 });
    return JSON.parse(stdout || '[]') as ProcessIdentity[];
  }
  // procps (Linux/WSL) selects every process with -e; on macOS -e would add environments instead.
  const { stdout } = await exec('/bin/ps', [platform === 'linux' ? '-eo' : '-axo', 'pid=,pgid=,ppid=,lstart=,command='], { env: { ...process.env, LC_ALL: 'C' }, maxBuffer: 16 * 1024 * 1024 });
  return stdout.split('\n').flatMap(line => {
    const match = line.trim().match(/^(\d+)\s+(\d+)\s+(\d+)\s+(\w+\s+\w+\s+\d+\s+[\d:]+\s+\d+)\s+(.*)$/);
    return match ? [{ pid: +match[1], pgid: +match[2], ppid: +match[3], started: match[4], command: match[5] }] : [];
  });
}
export async function identity(pid: number) { return (await processes()).find(p => p.pid === pid); }
export const sameProcess = (a: ProcessIdentity, b?: ProcessIdentity) => !!b && a.pid === b.pid && a.started === b.started && a.pgid === b.pgid;
export function alive(pid: number): boolean { try { process.kill(pid, 0); return true; } catch (e) { return (e as NodeJS.ErrnoException).code === 'EPERM'; } }
export function signalGroup(pgid: number, signal: NodeJS.Signals) {
  if (pgid <= 1) throw new Error(`Refusing invalid process group ${pgid}`);
  if (platform === 'windows') { execFileSync(jobExecutable(), ['--stop', String(pgid)], { windowsHide: true, timeout: 10000 }); return; }
  try { process.kill(-pgid, signal); } catch (e) { if ((e as NodeJS.ErrnoException).code !== 'ESRCH') throw e; }
}
export async function stopGroup(pgid: number, graceMs: number) {
  if (!Number.isSafeInteger(pgid) || pgid <= 1) throw new Error('Invalid owned process ID');
  if (platform === 'windows') { await exec(jobExecutable(), ['--stop', String(pgid)], { windowsHide: true, timeout: graceMs + 10000 }); return; }
  const subject = -pgid;
  if (!alive(subject)) return;
  signalGroup(pgid, 'SIGTERM');
  const deadline = Date.now() + graceMs;
  while (alive(subject) && Date.now() < deadline) await delay(100);
  if (alive(subject)) signalGroup(pgid, 'SIGKILL');
  const forceDeadline = Date.now() + 2000;
  while (alive(subject) && Date.now() < forceDeadline) await delay(100);
  if (alive(subject)) throw new Error(`Process group ${pgid} did not stop`);
}

export async function runCommand(command: string, service: ServiceConfig, shell: string, env: NodeJS.ProcessEnv, timeoutMs: number, signal?: AbortSignal): Promise<{ code: number; output: string }> {
  const child = launch(command, service.cwd, shell, env);
  let output = '';
  child.stdout?.on('data', c => { output = (output + c.toString()).slice(-8000); });
  child.stderr?.on('data', c => { output = (output + c.toString()).slice(-8000); });
  let killError: unknown;
  const kill = () => { if (child.pid) { try { signalGroup(child.pid, 'SIGKILL'); } catch (error) { killError = error; child.kill('SIGKILL'); } } };
  const timer = setTimeout(kill, timeoutMs);
  signal?.addEventListener('abort', kill, { once: true });
  if (signal?.aborted) kill();
  try {
    return await new Promise((resolve, reject) => {
      child.once('error', reject);
      child.once('exit', code => resolve({ code: code ?? 1, output }));
    });
  } finally {
    clearTimeout(timer); signal?.removeEventListener('abort', kill);
    // Probes and cleanup commands must never leave background descendants.
    if (child.pid) await stopGroup(child.pid, 250);
    if (killError) throw killError;
  }
}
