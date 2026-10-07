import { linuxListeners, windowsListeners } from './port-inspection';
import { exec, processes, identity, sameProcess, stopGroup, delay, type ProcessIdentity } from './process';

export interface PortController { reclaim(ports: number[], log: (text: string) => void): Promise<void>; verifyFree(ports: number[]): Promise<void> }

export async function listeners(port: number, host: NodeJS.Platform = process.platform): Promise<number[]> {
  if (host === 'linux') return linuxListeners(port);
  if (host === 'win32') return windowsListeners(port);
  try {
    const { stdout } = await exec('/usr/sbin/lsof', ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN', '-t'], { timeout: 5000 });
    return [...new Set(stdout.trim().split(/\s+/).filter(Boolean).map(Number))];
  } catch (error) {
    if ((error as { code?: number }).code === 1) return [];
    throw error;
  }
}

const shellCommand = (p: ProcessIdentity) => {
  const match = p.command.match(/^(?:-?\/?(?:[^ ]*\/)?(?:zsh|bash|sh|fish|login))(?:\s+(.*))?$/);
  // A noninteractive `sh -c command` is an ordinary supervisor, not the user's terminal shell.
  return !!match && !/^-[a-z]*c(?:\s|$)/.test(match[1] ?? '');
};
const protectedCommand = (p: ProcessIdentity) => /com\.docker|docker-proxy|wslhost|wslrelay|wslservice|svchost|vpnkit|OrbStack|limactl|Devenv\.app|devenv.*(?:main|supervisor)\.cjs/i.test(p.command);

export class NativePorts implements PortController {
  constructor(private env: NodeJS.ProcessEnv = process.env, private host: NodeJS.Platform = process.platform) {}

  private async containers(ports: number[]): Promise<{ id: string; name: string; ports: number[] }[]> {
    let ids: string[];
    try {
      const { stdout } = await exec('docker', ['ps', '-q'], { env: this.env, timeout: 8000 });
      ids = stdout.trim().split(/\s+/).filter(Boolean);
    } catch { return []; }
    if (!ids.length) return [];
    const { stdout } = await exec('docker', ['inspect', ...ids], { env: this.env, timeout: 10000, maxBuffer: 8 * 1024 * 1024 });
    const entries = JSON.parse(stdout) as Array<{ Id: string; Name: string; NetworkSettings: { Ports: Record<string, Array<{ HostPort: string }> | null> } }>;
    return entries.flatMap(c => {
      const published = Object.entries(c.NetworkSettings.Ports ?? {}).filter(([key]) => key.endsWith('/tcp')).flatMap(([, bindings]) => (bindings ?? []).map(b => +b.HostPort));
      return published.some(p => ports.includes(p)) ? [{ id: c.Id, name: c.Name.replace(/^\//, ''), ports: published.filter(p => ports.includes(p)) }] : [];
    });
  }

  async reclaim(ports: number[], log: (text: string) => void) {
    if (!ports.length) return;
    for (const container of await this.containers(ports)) {
      log(`Reclaiming ${container.ports.join(', ')}: stopping Docker container ${container.name}`);
      await exec('docker', ['stop', '--time', '15', container.id], { env: this.env, timeout: 20000 });
    }
    const stopped = new Set<number>();
    for (const port of ports) {
      for (const pid of await listeners(port, this.host)) {
        const table = await processes();
        const owner = table.find(p => p.pid === pid);
        if (!owner) throw new Error(`Port ${port} ownership changed or is inaccessible. Retry after inspecting the listener.`);
        if (this.host === 'win32') throw new Error(/wsl(?:relay|host|service)/i.test(owner.command) ? `Port ${port} is forwarded from a WSL distribution. Stop the Linux service listening on it; Devenv never stops WSL networking processes.` : `Port ${port} belongs to PID ${pid}. Stop this external Windows process manually; only Devenv Job Objects can be reclaimed safely.`);
        const ancestors = new Set<number>();
        let ancestor = table.find(p => p.pid === process.pid);
        while (ancestor && !ancestors.has(ancestor.pid)) { ancestors.add(ancestor.pid); ancestor = table.find(p => p.pid === ancestor!.ppid); }
        const group = table.filter(p => p.pgid === owner.pgid);
        if (owner.pgid <= 1 || group.some(p => ancestors.has(p.pid) || protectedCommand(p) || shellCommand(p))) {
          throw new Error(`Port ${port} belongs to PID ${pid} (${owner.command.slice(0, 100)}). Its process group includes a shell or protected process; stop it manually.`);
        }
        if (stopped.has(owner.pgid)) continue;
        if (!sameProcess(owner, await identity(owner.pid))) continue;
        log(`Reclaiming ${port}: stopping process group ${owner.pgid} (${owner.command.slice(0, 100)})`);
        await stopGroup(owner.pgid, 15000);
        stopped.add(owner.pgid);
      }
    }
    await delay(300);
    await this.verifyFree(ports);
  }

  async verifyFree(ports: number[]) {
    for (const port of ports) {
      const pids = await listeners(port, this.host);
      if (pids.length) throw new Error(`Port ${port} is still occupied by PID ${pids.join(', ')}. A service may be restarting automatically.`);
    }
  }
}

export class MacPorts extends NativePorts { constructor(env: NodeJS.ProcessEnv = process.env) { super(env, 'darwin'); } }
