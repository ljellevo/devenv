import { EventEmitter } from 'node:events';
import { mkdir, readFile, writeFile, rename, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { ChildProcess } from 'node:child_process';
import type { Project, ServiceConfig, ServiceState, Session } from '../shared/types';
import { dependencyOrder, loadProject, validateRuntimePaths } from './config';
import { Logs } from './logs';
import { MacPorts, type PortController } from './ports';
import { alive, delay, identity, launch, message, processes, runCommand, sameProcess, serviceEnvironment, stopGroup, type ProcessIdentity } from './process';

interface Runtime { config: ServiceConfig; env: NodeJS.ProcessEnv; child?: ChildProcess; follower?: ChildProcess; identity?: ProcessIdentity; followerIdentity?: ProcessIdentity; settled?: Promise<number>; started: boolean; }
interface Journal { session: Session; shell: string; owned: Array<{ service: string; identity: ProcessIdentity }>; started: string[] }

export class Engine extends EventEmitter {
  session: Session | null = null;
  logs?: Logs;
  private runtime = new Map<string, Runtime>();
  private abort?: AbortController;
  private queue: Promise<unknown> = Promise.resolve();
  private journalQueue: Promise<void> = Promise.resolve();
  private monitor?: ReturnType<typeof setInterval>;
  private monitoring = false;
  private working = false;
  private portController: PortController;
  constructor(readonly root: string, private shell: string, private env: NodeJS.ProcessEnv, ports?: PortController) {
    super(); this.portController = ports ?? new MacPorts(env);
  }
  configure(shell: string, env: NodeJS.ProcessEnv) { this.shell = shell; this.env = env; this.portController = new MacPorts(env); }
  private serialize<T>(fn: () => Promise<T>): Promise<T> {
    const result = this.queue.then(async () => { this.working = true; try { return await fn(); } finally { this.working = false; } }); this.queue = result.catch(() => {}); return result;
  }
  private update() { this.emit('state', this.session ? structuredClone(this.session) : null); }
  private state(name: string): ServiceState { return this.session!.services.find(s => s.name === name)!; }
  private log(name: string, text: string) { this.logs?.write(name, 'system', `[devenv] ${text}\n`); }
  private status(name: string, status: ServiceState['status'], error?: string) { Object.assign(this.state(name), { status, error }); this.update(); }
  private checkCancelled() { if (this.abort?.signal.aborted) throw new Error('Startup cancelled'); }

  start(file: string, onlyService?: string) {
    return this.serialize(async () => {
      const project = await loadProject(file); // Validate before stopping anything.
      if (project.install && !project.installed) throw new Error('Install this project before running it.');
      await validateRuntimePaths(project);
      const enabled = project.services.filter(s => s.enabled);
      const selected = new Set<string>();
      const include = (name: string) => {
        const config = enabled.find(s => s.name === name);
        if (!config) throw new Error(`Unknown or disabled service: ${name}`);
        if (selected.has(name)) return;
        selected.add(name); config.depends_on.forEach(include);
      };
      if (onlyService) include(onlyService); else enabled.forEach(s => selected.add(s.name));
      if (this.session && this.session.status !== 'stopped') await this.stopInternal();
      this.abort?.abort(); this.abort = new AbortController();
      this.runtime.clear();
      this.session = { id: `${new Date().toISOString().replaceAll(':', '-')}-${randomUUID().slice(0, 8)}`, project, status: 'starting', startedAt: new Date().toISOString(), services: enabled.map(s => ({ name: s.name, status: selected.has(s.name) ? 'pending' : 'stopped' })) };
      this.logs = new Logs(this.root, this.session.id, entry => this.emit('log', entry));
      this.update();
      try {
        // Materialize environments before mutations; a broken env_file must not leave half a stack.
        for (const config of enabled) this.runtime.set(config.name, { config, env: await serviceEnvironment(config, this.env), started: false });
        await this.journal();
        this.checkCancelled();
        await this.portController.reclaim(enabled.filter(s => selected.has(s.name)).flatMap(s => s.ports), text => this.log('_session', text));
        this.checkCancelled();
        // Dependency-ready waves. Await every sibling before rollback so no late spawn can escape cleanup.
        const pending = new Set(selected);
        while (pending.size) {
          this.checkCancelled();
          const wave = [...pending].filter(name => this.runtime.get(name)!.config.depends_on.every(dep => ['running', 'ready', 'completed'].includes(this.state(dep).status)));
          if (!wave.length) throw new Error('A dependency failed before its dependants could start');
          const results = await Promise.allSettled(wave.map(async name => {
            try { await this.startService(name); pending.delete(name); }
            catch (error) { this.abort?.abort(); throw error; }
          }));
          const failure = results.find((r): r is PromiseRejectedResult => r.status === 'rejected');
          if (failure) throw failure.reason;
        }
        this.checkCancelled();
        if (this.session.services.some(s => s.status === 'failed')) throw new Error('A service exited during startup');
        this.session.status = 'running'; this.update(); await this.journal(); this.startMonitor();
      } catch (error) {
        const reason = message(error);
        this.log('_session', reason);
        try { await this.stopInternal(); } catch (cleanup) { this.session.error = `${reason}; cleanup: ${message(cleanup)}`; this.update(); throw new Error(this.session.error); }
        this.session.status = 'failed'; this.session.error = reason; this.update();
        throw new Error(reason);
      }
    });
  }

  stop() {
    this.abort?.abort();
    return this.serialize(() => this.stopInternal());
  }
  startOne(name: string) { return this.serialize(() => this.startMissing([name])); }
  startAll() { return this.serialize(() => this.startMissing([...this.runtime.keys()])); }
  private async startMissing(names: string[]) {
    if (!this.session || !['running', 'degraded'].includes(this.session.status)) throw new Error('No active session');
    const selected = new Set<string>();
    const include = (name: string) => {
      const runtime = this.runtime.get(name);
      if (!runtime) throw new Error(`Unknown or disabled service: ${name}`);
      if (selected.has(name)) return;
      selected.add(name); runtime.config.depends_on.forEach(include);
    };
    names.forEach(include);
    const order = dependencyOrder([...this.runtime.values()].map(r => r.config)).filter(s => selected.has(s.name));
    const startedNow: Runtime[] = [];
    let failedName: string | undefined;
    this.abort?.abort(); this.abort = new AbortController();
    try {
      for (const config of order) {
        const state = this.state(config.name);
        if (['running', 'ready', 'completed'].includes(state.status)) continue;
        failedName = config.name;
        const runtime = this.runtime.get(config.name)!;
        if (runtime.started) await this.stopService(runtime);
        await this.portController.reclaim(config.ports, text => this.log('_session', text));
        startedNow.push(runtime);
        await this.startService(config.name);
      }
      this.recompute(); await this.journal();
    } catch (error) {
      const cleanup: string[] = [];
      for (const runtime of startedNow.reverse()) {
        try { await this.stopService(runtime); }
        catch (cause) { cleanup.push(message(cause)); break; }
      }
      if (failedName && !cleanup.length) this.status(failedName, 'failed', message(error));
      if (cleanup.length) this.session.error = `${message(error)}; cleanup: ${cleanup.join('; ')}`;
      this.recompute(); await this.journal();
      throw new Error(cleanup.length ? `${message(error)}; cleanup: ${cleanup.join('; ')}` : message(error));
    }
  }
  stopOne(name: string) {
    return this.serialize(async () => {
      if (!this.session || !['running', 'degraded'].includes(this.session.status)) throw new Error('No active session');
      if (!this.runtime.has(name)) throw new Error(`Unknown or disabled service: ${name}`);
      const affected = new Set([name]);
      let changed = true;
      while (changed) {
        changed = false;
        for (const runtime of this.runtime.values()) {
          if (!affected.has(runtime.config.name) && runtime.config.depends_on.some(dep => affected.has(dep))) {
            affected.add(runtime.config.name); changed = true;
          }
        }
      }
      const order = dependencyOrder([...this.runtime.values()].map(r => r.config)).reverse().filter(s => affected.has(s.name));
      const errors: string[] = [];
      for (const config of order) {
        const runtime = this.runtime.get(config.name)!;
        if (!runtime.started) continue;
        try {
          await this.stopService(runtime);
          await this.portController.verifyFree(config.ports);
        } catch (error) { errors.push(message(error)); break; }
      }
      if (errors.length) {
        this.session.status = 'degraded'; this.session.error = errors.join('; ');
        await this.journal(); this.update(); throw new Error(this.session.error);
      }
      if ([...this.runtime.values()].every(r => !r.started)) await this.stopInternal();
      else { this.recompute(); await this.journal(); }
    });
  }
  restart(name: string) {
    return this.serialize(async () => {
      if (!this.session || !['running', 'degraded'].includes(this.session.status)) throw new Error('No active session');
      const runtime = this.runtime.get(name);
      if (!runtime) throw new Error('Unknown service');
      if (!runtime.config.depends_on.every(dep => ['running', 'ready', 'completed'].includes(this.state(dep).status))) throw new Error('Restart the failed dependencies first');
      this.abort?.abort(); this.abort = new AbortController();
      await this.stopService(runtime);
      await this.portController.reclaim(runtime.config.ports, text => this.log('_session', text));
      try { await this.startService(name); }
      catch (error) { await this.stopService(runtime).catch(() => {}); this.status(name, 'failed', message(error)); throw error; }
      finally { this.recompute(); await this.journal(); }
    });
  }

  private attach(runtime: Runtime, child: ChildProcess, follower = false) {
    const name = runtime.config.name;
    child.stdout?.setEncoding('utf8'); child.stderr?.setEncoding('utf8');
    child.stdout?.on('data', text => this.logs?.write(name, 'stdout', text));
    child.stderr?.on('data', text => this.logs?.write(name, 'stderr', text));
    const result = new Promise<number>((resolve) => {
      child.once('error', error => { this.log(name, message(error)); resolve(127); });
      child.once('exit', (code, signal) => {
        const current = this.state(name);
        if (!follower) current.exitCode = code;
        if (['running', 'ready'].includes(current.status) && !['stopping', 'stopped'].includes(this.session!.status)) {
          if (follower) this.log(name, `Log command exited (${code ?? signal})`);
          else if (runtime.config.allow_successful_exit && code === 0) this.status(name, 'completed');
          else { this.status(name, 'failed', `Command exited (${code ?? signal})`); this.recompute(); }
        }
        resolve(code ?? 1);
      });
    });
    return result;
  }

  private async startService(name: string) {
    this.checkCancelled();
    const runtime = this.runtime.get(name)!;
    const { config, env } = runtime;
    this.status(name, 'starting'); this.log(name, `Starting: ${config.command}`);
    try {
      runtime.started = true; await this.journal();
      this.checkCancelled();
      const child = launch(config.command, config.cwd, this.shell, env);
      runtime.child = child; runtime.settled = this.attach(runtime, child);
      if (child.pid) { this.state(name).pid = child.pid; runtime.identity = await identity(child.pid); }
      await this.journal();
      const deadline = Date.now() + config.startup_timeout * 1000;
      if (config.mode === 'task' || config.mode === 'background') {
        const code = await this.waitExit(runtime, deadline);
        if (code !== 0) throw new Error(`Command exited with code ${code}`);
        if (config.mode === 'task') { if (child.pid) await stopGroup(child.pid, 500); this.status(name, 'completed'); return; }
      }
      if (config.ready_command) {
        let last = '';
        while (Date.now() < deadline) {
          this.checkCancelled();
          if (config.mode === 'process' && (child.exitCode !== null || child.signalCode || !child.pid)) {
            if (child.exitCode === 0 && config.allow_successful_exit) { this.status(name, 'completed'); return; }
            throw new Error(`Command exited before readiness (${child.exitCode ?? child.signalCode ?? 'spawn error'})`);
          }
          const probe = await runCommand(config.ready_command, config, this.shell, env, Math.min(5000, deadline - Date.now()), this.abort?.signal);
          if (probe.code === 0) { this.status(name, 'ready'); break; }
          last = `last probe exited ${probe.code}${probe.output.trim() ? ': ' + probe.output.trim() : ''}`; await delay(250);
        }
        if (this.state(name).status !== 'ready') throw new Error(`Readiness timed out after ${config.startup_timeout}s${last ? ': ' + last.slice(-500) : ''}`);
      } else {
        await delay(250); this.checkCancelled();
        if (child.exitCode !== null || child.signalCode || !child.pid) {
          if (child.exitCode === 0 && config.allow_successful_exit) this.status(name, 'completed');
          else throw new Error(`Command exited (${child.exitCode ?? child.signalCode ?? 'spawn error'})`);
        } else this.status(name, 'running');
      }
      if (config.logs_command) {
        const follower = launch(config.logs_command, config.cwd, this.shell, env);
        runtime.follower = follower; this.attach(runtime, follower, true);
        if (follower.pid) runtime.followerIdentity = await identity(follower.pid);
      }
      await this.journal();
    } catch (error) { this.status(name, 'failed', message(error)); throw new Error(`${name}: ${message(error)}`); }
  }

  private async waitExit(runtime: Runtime, deadline: number): Promise<number> {
    let result: number | undefined;
    runtime.settled!.then(code => { result = code; });
    while (result === undefined) {
      this.checkCancelled();
      if (Date.now() >= deadline) throw new Error(`Command timed out after ${runtime.config.startup_timeout}s`);
      await delay(50);
    }
    return result;
  }

  private async stopService(runtime: Runtime) {
    if (!runtime.started) return;
    const { config } = runtime;
    this.status(config.name, 'stopping');
    const errors: string[] = [];
    if (config.stop_command) {
      try {
        const result = await runCommand(config.stop_command, config, this.shell, runtime.env, config.stop_timeout * 1000);
        if (result.output) this.log(config.name, result.output);
        if (result.code !== 0) errors.push(`Cleanup exited ${result.code}`);
      } catch (error) { errors.push(message(error)); }
    }
    for (const child of [runtime.follower, runtime.child]) {
      if (!child?.pid) continue;
      try {
        const recorded = child === runtime.child ? runtime.identity : runtime.followerIdentity;
        const current = await identity(child.pid);
        if (current && !recorded && (child.exitCode !== null || child.signalCode)) throw new Error(`Cannot verify old PID ${child.pid}; refusing to signal it`);
        if (current && recorded && !sameProcess(recorded, current)) throw new Error(`PID ${child.pid} has been reused; refusing to signal it`);
        await stopGroup(child.pid, config.stop_timeout * 1000);
      } catch (error) { errors.push(message(error)); }
    }
    if (errors.length) { this.status(config.name, 'failed', errors.join('; ')); throw new Error(`${config.name}: ${errors.join('; ')}`); }
    runtime.started = false; this.status(config.name, 'stopped'); await this.journal();
  }

  private async stopInternal() {
    if (!this.session || this.session.status === 'stopped') return;
    this.abort?.abort();
    if (this.monitor) clearInterval(this.monitor);
    this.session.status = 'stopping'; this.update();
    const errors: string[] = [];
    const started = new Set([...this.runtime.values()].filter(r => r.started).map(r => r.config.name));
    for (const config of dependencyOrder([...this.runtime.values()].map(r => r.config)).reverse()) {
      try { await this.stopService(this.runtime.get(config.name)!); } catch (error) { errors.push(message(error)); }
    }
    // Only services actually launched belong to this shutdown; a preflight conflict is not ours.
    const ownedPorts = this.session.project.services.filter(s => started.has(s.name) && this.state(s.name)?.status === 'stopped').flatMap(s => s.ports);
    try { await this.portController.verifyFree(ownedPorts); } catch (error) { errors.push(message(error)); }
    if (errors.length) {
      this.session.status = 'degraded'; this.session.error = errors.join('; '); await this.journal(); this.update(); throw new Error(this.session.error);
    }
    this.logs?.finish(); this.session.status = 'stopped'; this.session.error = undefined;
    await this.journalQueue; await rm(join(this.root, 'session.json'), { force: true }); this.update();
  }

  private recompute() {
    if (!this.session || !['running', 'degraded'].includes(this.session.status)) return;
    this.session.status = this.session.services.some(s => s.status === 'failed') ? 'degraded' : 'running';
    if (this.session.status === 'running') this.session.error = undefined;
    this.update();
  }
  private startMonitor() {
    if (this.monitor) clearInterval(this.monitor);
    this.monitor = setInterval(() => { void this.healthCheck().catch(error => this.log('_session', message(error))); }, 5000);
    this.monitor.unref();
  }
  private async healthCheck() {
    if (this.working || this.monitoring || !this.session || !['running', 'degraded'].includes(this.session.status)) return;
    this.monitoring = true;
    try {
      for (const runtime of this.runtime.values()) {
        const before = this.state(runtime.config.name).status;
        if (!runtime.config.ready_command || !['ready', 'running'].includes(before)) continue;
        const probe = await runCommand(runtime.config.ready_command, runtime.config, this.shell, runtime.env, 4000, this.abort?.signal);
        if (this.working || this.state(runtime.config.name).status !== before || this.session.status === 'stopping') continue;
        if (probe.code !== 0) this.status(runtime.config.name, 'failed', `Readiness check failed: ${probe.output.slice(-400)}`);
      }
      this.recompute();
    } finally { this.monitoring = false; }
  }

  private journal(): Promise<void> {
    if (!this.session) return Promise.resolve();
    const data: Journal = { session: structuredClone(this.session), shell: this.shell, started: [...this.runtime.values()].filter(r => r.started).map(r => r.config.name), owned: [...this.runtime.values()].flatMap(r => [r.identity, r.followerIdentity].filter((p): p is ProcessIdentity => !!p).map(identity => ({ service: r.config.name, identity }))) };
    const write = async () => {
      await mkdir(this.root, { recursive: true, mode: 0o700 });
      await writeFile(join(this.root, 'session.tmp'), JSON.stringify(data), { mode: 0o600 });
      await rename(join(this.root, 'session.tmp'), join(this.root, 'session.json'));
    };
    this.journalQueue = this.journalQueue.then(write, write); return this.journalQueue;
  }

  async recover() {
    let journal: Journal;
    try { journal = JSON.parse(await readFile(join(this.root, 'session.json'), 'utf8')); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return; throw new Error(`Cannot read recovery journal: ${message(error)}`); }
    const table = await processes();
    for (const owned of journal.owned) {
      const current = table.find(p => p.pid === owned.identity.pid);
      if (sameProcess(owned.identity, current)) await stopGroup(owned.identity.pgid, 15000);
      else if (table.some(p => p.pgid === owned.identity.pgid)) throw new Error(`Cannot verify old process group ${owned.identity.pgid}; inspect it before starting a session.`);
    }
    // Commands are the previous session's snapshot, never a newly edited configuration.
    for (const config of dependencyOrder(journal.session.project.services.filter(s => s.enabled)).reverse()) {
      if (!journal.started.includes(config.name) || !config.stop_command) continue;
      const result = await runCommand(config.stop_command, config, journal.shell, await serviceEnvironment(config, this.env), config.stop_timeout * 1000);
      if (result.code !== 0) throw new Error(`Recovery cleanup failed for ${config.name}: ${result.output}`);
    }
    await rm(join(this.root, 'logs', journal.session.id, 'active'), { force: true });
    await rm(join(this.root, 'session.json'), { force: true });
  }
}
