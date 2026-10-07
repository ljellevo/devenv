import { exec } from './process';
import { defaultShell, encodedPowerShell } from './platform';
export function parseSS(output: string, port: number): number[] {
  const pids = new Set<number>();
  for (const line of output.trim().split('\n').filter(Boolean)) {
    const owners = [...line.matchAll(/pid=(\d+)/g)].map(match => Number(match[1]));
    if (!owners.length) throw new Error(`Port ${port} is occupied but its ownership is inaccessible. Stop the listener manually.`);
    owners.forEach(pid => pids.add(pid));
  }
  return [...pids];
}
export async function linuxListeners(port: number): Promise<number[]> {
  try { return parseSS((await exec('ss', ['-H', '-ltnp', `sport = :${port}`], { timeout: 5000 })).stdout, port); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    // lsof can omit inaccessible sockets; verify all listening sockets through /proc before trusting an empty result.
    const { readFile } = await import('node:fs/promises');
    const tables = await Promise.all(['/proc/net/tcp', '/proc/net/tcp6'].map(file => readFile(file, 'utf8')));
    const occupied = tables.some(table => table.split('\n').slice(1).some(line => {
      const columns = line.trim().split(/\s+/);
      return columns[3] === '0A' && parseInt(columns[1]?.split(':')[1] ?? '', 16) === port;
    }));
    if (!occupied) return [];
    try {
      const { stdout } = await exec('lsof', ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN', '-t'], { timeout: 5000 });
      const pids = stdout.trim().split(/\s+/).filter(Boolean).map(Number);
      if (pids.length) return [...new Set(pids)];
    } catch { /* Report inaccessible ownership below. */ }
    throw new Error(`Port ${port} is occupied but its ownership is inaccessible.`);
  }
}
export interface WindowsListener { pid: number; name: string }
export async function windowsListenerOwners(port: number): Promise<WindowsListener[]> {
  const { stdout } = await exec(await defaultShell(), encodedPowerShell(`$ErrorActionPreference='Stop'; @(Get-NetTCPConnection -State Listen | Where-Object { $_.LocalPort -eq ${port} } | Select-Object -ExpandProperty OwningProcess -Unique | ForEach-Object { @{ pid = [int]$_; name = [string](Get-Process -Id $_ -ErrorAction SilentlyContinue).ProcessName } }) | ConvertTo-Json -Compress`), { timeout: 10000 });
  const value = JSON.parse(stdout || '[]');
  const owners: WindowsListener[] = Array.isArray(value) ? value : [value];
  if (owners.some(owner => !Number.isSafeInteger(owner.pid) || owner.pid <= 0)) throw new Error(`Port ${port} ownership is inaccessible.`);
  return owners;
}
export async function windowsListeners(port: number): Promise<number[]> { return (await windowsListenerOwners(port)).map(owner => owner.pid); }
// WSL publishes Linux listeners on Windows through these processes. They are inspected inside the distribution instead.
export const wslNetworkingProcess = (name: string) => /^(?:wslrelay|wslhost|wslservice|vmmem|vmmemwsl)$/i.test(name);
