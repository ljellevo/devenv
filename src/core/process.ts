import { spawn, execFile, type ChildProcess } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile } from 'node:fs/promises';
import { parse } from 'dotenv';
import type { ServiceConfig } from '../shared/types';

export const exec = promisify(execFile);
export const delay = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));
export const message = (error: unknown) => error instanceof Error ? error.message : String(error);
export const quote = (value: string) => "'" + value.replaceAll("'", "'\\''") + "'";

export async function shellEnvironment(shell: string): Promise<NodeJS.ProcessEnv> {
  const marker = '__DEVENV_ENV_8F21__';
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

export function launch(command: string, cwd: string, shell: string, env: NodeJS.ProcessEnv): ChildProcess {
  return spawn(shell, ['-c', command], { cwd, env, detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
}

export interface ProcessIdentity { pid: number; pgid: number; ppid: number; started: string; command: string }
export async function processes(): Promise<ProcessIdentity[]> {
  const { stdout } = await exec('/bin/ps', ['-axo', 'pid=,pgid=,ppid=,lstart=,command=']);
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
  try { process.kill(-pgid, signal); } catch (e) { if ((e as NodeJS.ErrnoException).code !== 'ESRCH') throw e; }
}
export async function stopGroup(pgid: number, graceMs: number) {
  if (!alive(-pgid)) return;
  signalGroup(pgid, 'SIGTERM');
  const deadline = Date.now() + graceMs;
  while (alive(-pgid) && Date.now() < deadline) await delay(100);
  if (alive(-pgid)) signalGroup(pgid, 'SIGKILL');
  const forceDeadline = Date.now() + 2000;
  while (alive(-pgid) && Date.now() < forceDeadline) await delay(100);
  if (alive(-pgid)) throw new Error(`Process group ${pgid} did not stop`);
}

export async function runCommand(command: string, service: ServiceConfig, shell: string, env: NodeJS.ProcessEnv, timeoutMs: number, signal?: AbortSignal): Promise<{ code: number; output: string }> {
  const child = launch(command, service.cwd, shell, env);
  let output = '';
  child.stdout?.on('data', c => { output = (output + c.toString()).slice(-8000); });
  child.stderr?.on('data', c => { output = (output + c.toString()).slice(-8000); });
  const kill = () => { if (child.pid) signalGroup(child.pid, 'SIGKILL'); };
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
  }
}
