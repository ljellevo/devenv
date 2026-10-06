import { describe, it, expect, afterEach, vi } from 'vitest';
import { mkdtemp, writeFile, rm, readFile, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Engine } from '../src/core/engine';
import { alive, delay, quote, runCommand, identity } from '../src/core/process';
import type { PortController } from '../src/core/ports';
// macOS's tool sandbox denies ps. Keep the process-table boundary deterministic;
// services below are still real, isolated subprocesses and their exits are verified.
vi.mock('../src/core/process', async importOriginal => {
  const actual = await importOriginal<typeof import('../src/core/process')>();
  if (process.env.DEVENV_TEST_OS === '1') return actual;
  const owned = new Map<number, import('../src/core/process').ProcessIdentity>();
  owned.set(process.pid, { pid: process.pid, pgid: process.pid, ppid: 1, started: 'test-runner', command: 'vitest' });
  return { ...actual,
    launch: (...args: Parameters<typeof actual.launch>) => {
      const child = actual.launch(...args);
      if (child.pid) owned.set(child.pid, { pid: child.pid, pgid: child.pid, ppid: process.pid, started: `fixture-${child.pid}`, command: args[0] });
      return child;
    },
    identity: async (pid: number) => owned.get(pid),
    processes: async () => [...owned.values()].filter(p => actual.alive(p.pid)),
  };
});
const fixtures: Array<{ root: string; engine: Engine }> = [];
const ports: PortController = { reclaim: async () => {}, verifyFree: async () => {} };
const node = quote(process.execPath);
async function setup(config: string, controller: PortController = ports) {
  const root = await mkdtemp(join(tmpdir(), "devenv engine 'quoted'-"));
  const file = join(root, 'devenv.toml');
  await writeFile(file, `version=1\nname="Fixture"\n${config}`);
  const engine = new Engine(join(root, 'data'), '/bin/sh', { ...process.env }, controller);
  fixtures.push({ root, engine }); return { root, file, engine };
}
afterEach(async () => { for (const { root, engine } of fixtures.splice(0)) { await engine.stop().catch(() => {}); await rm(root, { recursive: true, force: true }); } });
const service = (name: string, script: string, extra = '') => `[services.${name}]\ncommand=${JSON.stringify(`${node} -e ${quote(script)}`)}\nstop_timeout=1\nstartup_timeout=3\n${extra}\n`;
async function until(check: () => boolean | Promise<boolean>) { const deadline = Date.now() + 5000; while (!await check()) { if (Date.now() > deadline) throw new Error('Condition timed out'); await delay(40); } }
describe('session lifecycle', () => {
  it('honors task dependencies and readiness; captures stdout/stderr and stops process trees', async () => {
    const { root, file, engine } = await setup(
      service('prepare', "require('fs').writeFileSync('prepared','yes')", 'mode="task"') +
      service('server', "const fs=require('fs'); if(!fs.existsSync('prepared'))process.exit(3); console.log('hello'); console.error('stderr'); const c=require('child_process').spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore'}); fs.writeFileSync('child',String(c.pid)); setInterval(()=>{},1000)", 'depends_on=["prepare"]\nready_command="test -f child"'));
    await engine.start(file);
    expect(engine.session?.status).toBe('running');
    expect(engine.session?.services.map(s => s.status)).toEqual(['completed', 'ready']);
    expect(engine.logs?.read().map(e => e.text).join('')).toContain('stderr');
    const child = Number(await readFile(join(root, 'child'), 'utf8'));
    const parent = engine.session!.services[1].pid!;
    await engine.stop(); expect(alive(parent)).toBe(false); expect(alive(child)).toBe(false);
    expect(engine.session?.status).toBe('stopped');
  });
  it('rolls back all siblings on failed startup and does not launch dependants', async () => {
    const { file, engine } = await setup(service('ok', 'setInterval(()=>{},1000)') + service('bad', 'process.exit(7)') + service('dependent', 'setInterval(()=>{},1000)', 'depends_on=["bad"]'));
    await expect(engine.start(file)).rejects.toThrow();
    expect(engine.session?.status).toBe('failed');
    for (const state of engine.session!.services) if (state.pid) expect(alive(state.pid)).toBe(false);
    expect(engine.session?.services.find(s => s.name === 'dependent')?.pid).toBeUndefined();
  });
  it('cancels startup while waiting for readiness and cleans up', async () => {
    const { file, engine } = await setup(service('slow', 'setInterval(()=>{},1000)', 'ready_command="false"'));
    const starting = engine.start(file); const observed = starting.catch(() => {});
    await until(() => !!engine.session?.services[0].pid);
    await engine.stop(); await observed;
    expect(engine.session?.status).toBe('stopped'); expect(alive(engine.session!.services[0].pid!)).toBe(false);
  });
  it('leaves other services up after a runtime crash and supports manual retry', async () => {
    const script = "const fs=require('fs');if(!fs.existsSync('once')){fs.writeFileSync('once','');setTimeout(()=>process.exit(4),700)}else setInterval(()=>{},1000)";
    const { file, engine } = await setup(service('flaky', script) + service('stable', 'setInterval(()=>{},1000)'));
    await engine.start(file); await until(() => engine.session?.status === 'degraded');
    expect(alive(engine.session!.services.find(s => s.name === 'stable')!.pid!)).toBe(true);
    await engine.restart('flaky'); expect(engine.session?.status).toBe('running');
  });
  it('starts one service with its dependencies and later fills in the session', async () => {
    const { file, engine } = await setup(
      service('database', 'setInterval(()=>{},1000)') +
      service('api', 'setInterval(()=>{},1000)', 'depends_on=["database"]') +
      service('other', 'setInterval(()=>{},1000)'));
    await engine.start(file, 'api');
    expect(engine.session?.services.map(s => [s.name, s.status])).toEqual([['database', 'running'], ['api', 'running'], ['other', 'stopped']]);
    const databasePid = engine.session!.services[0].pid!;
    await engine.startAll();
    expect(engine.session?.services.map(s => s.status)).toEqual(['running', 'running', 'running']);
    expect(engine.session?.services[0].pid).toBe(databasePid);
    expect(alive(databasePid)).toBe(true);
  });
  it('stops dependents before a dependency, preserves independent services, and restarts the chain', async () => {
    const { file, engine } = await setup(
      service('database', 'setInterval(()=>{},1000)') +
      service('api', 'setInterval(()=>{},1000)', 'depends_on=["database"]') +
      service('web', 'setInterval(()=>{},1000)', 'depends_on=["api"]') +
      service('other', 'setInterval(()=>{},1000)'));
    await engine.start(file);
    const before = new Map(engine.session!.services.map(s => [s.name, s.pid!]));
    await engine.stopOne('database');
    expect(engine.session?.status).toBe('running');
    expect(engine.session?.services.map(s => s.status)).toEqual(['stopped', 'stopped', 'stopped', 'running']);
    for (const name of ['database', 'api', 'web']) expect(alive(before.get(name)!)).toBe(false);
    expect(alive(before.get('other')!)).toBe(true);
    await engine.startOne('web');
    expect(engine.session?.services.map(s => s.status)).toEqual(['running', 'running', 'running', 'running']);
    expect(engine.session?.services.find(s => s.name === 'other')?.pid).toBe(before.get('other'));
    await engine.stopOne('other');
    await engine.stopOne('database');
    expect(engine.session?.status).toBe('stopped');
  });
  it('keeps existing services when a selective startup fails', async () => {
    const { file, engine } = await setup(
      service('stable', 'setInterval(()=>{},1000)') +
      service('dependency', 'setInterval(()=>{},1000)') +
      service('broken', 'process.exit(7)', 'depends_on=["dependency"]'));
    await engine.start(file, 'stable');
    const stablePid = engine.session!.services[0].pid!;
    await expect(engine.startOne('broken')).rejects.toThrow('broken');
    expect(engine.session?.status).toBe('degraded');
    expect(engine.session?.services.map(s => s.status)).toEqual(['running', 'stopped', 'failed']);
    expect(alive(stablePid)).toBe(true);
  });
  it('claims and verifies ports only for services actually started', async () => {
    const claimed: number[][] = [], verified: number[][] = [];
    const controller: PortController = {
      reclaim: async values => { claimed.push(values); },
      verifyFree: async values => { verified.push(values); },
    };
    const { file, engine } = await setup(
      service('selected', 'setInterval(()=>{},1000)', 'ports=[4101]') +
      service('unselected', 'setInterval(()=>{},1000)', 'ports=[4102]'), controller);
    await engine.start(file, 'selected');
    await engine.stop();
    expect(claimed).toEqual([[4101]]);
    expect(verified.flat()).not.toContain(4102);
  });
  it('keeps a dependency running if a dependent refuses to stop', async () => {
    const { file, engine } = await setup(
      service('database', 'setInterval(()=>{},1000)') +
      service('web', 'setInterval(()=>{},1000)', 'depends_on=["database"]\nstop_command="false"'));
    await engine.start(file);
    const databasePid = engine.session!.services[0].pid!;
    await expect(engine.stopOne('database')).rejects.toThrow('Cleanup');
    expect(engine.session?.status).toBe('degraded');
    expect(alive(databasePid)).toBe(true);
  });
  it('rejects an unknown target before stopping the active project', async () => {
    const { file, engine } = await setup(service('stable', 'setInterval(()=>{},1000)'));
    await engine.start(file);
    const pid = engine.session!.services[0].pid!;
    await expect(engine.start(file, 'missing')).rejects.toThrow('Unknown or disabled service');
    expect(alive(pid)).toBe(true);
  });
  it('validates a destination before stopping the current project', async () => {
    const { root, file, engine } = await setup(service('a', 'setInterval(()=>{},1000)'));
    await engine.start(file); const pid = engine.session!.services[0].pid!;
    await writeFile(join(root, 'invalid.toml'), 'bad');
    await expect(engine.start(join(root, 'invalid.toml'))).rejects.toThrow();
    expect(alive(pid)).toBe(true); expect(engine.session?.status).toBe('running');
  });
  it('serializes switches and never leaves the first session running', async () => {
    const { root, file, engine } = await setup(service('a', 'setInterval(()=>{},1000)'));
    await engine.start(file); const pid = engine.session!.services[0].pid!;
    const second = join(root, 'second.toml'); await writeFile(second, 'version=1\nname="Second"\n' + service('b', 'setInterval(()=>{},1000)'));
    await engine.start(second); expect(alive(pid)).toBe(false); expect(engine.session?.project.name).toBe('Second');
  });
  it('accepts a successful no-op wrapper and cleans up background services explicitly', async () => {
    const { root, file, engine } = await setup(service('noop', 'process.exit(0)', 'allow_successful_exit=true') + '[services.background]\ncommand="touch started"\nmode="background"\nready_command="test -f started"\nstop_command="rm -f started"\nlogs_command="echo background-output; sleep 100"\nstop_timeout=1\n');
    await engine.start(file); expect(engine.session?.services[0].status).toBe('completed');
    await delay(100); expect(engine.logs?.read().map(e => e.text).join('')).toContain('background-output');
    await engine.stop(); await expect(access(join(root, 'started'))).rejects.toThrow();
  });
  it('blocks switching when cleanup fails', async () => {
    const { file, engine } = await setup(service('a', 'setInterval(()=>{},1000)', 'stop_command="false"'));
    await engine.start(file);
    await expect(engine.start(file)).rejects.toThrow('Cleanup');
    expect(engine.session?.status).toBe('degraded');
  });
  it('does not kill a different process with a reused journal identity', async () => {
    const { root, engine } = await setup(service('a', 'setInterval(()=>{},1000)'));
    const mine = await identity(process.pid);
    await writeFile(join(root, 'fake.json'), '{}');
    const { mkdir } = await import('node:fs/promises'); await mkdir(join(root, 'data'), { recursive: true });
    await writeFile(join(root, 'data/session.json'), JSON.stringify({ session: { id: 'old', project: { services: [] } }, shell: '/bin/sh', started: [], owned: [{ service: 'a', identity: { ...mine, started: 'different' } }] }));
    await expect(engine.recover()).rejects.toThrow('Cannot verify'); expect(alive(process.pid)).toBe(true);
  });
});
