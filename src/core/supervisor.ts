import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Engine } from './engine';
import { alive, message, shellEnvironment } from './process';
import { Installer } from './installer';

const [root, initialShell] = process.argv.slice(2);
let engine: Engine;
let installer: Installer;
let shuttingDown = false;
const send = (value: unknown) => { if (process.connected) process.send?.(value); };
const lock = join(root, 'supervisor.lock');
async function initialize() {
  await mkdir(root, { recursive: true, mode: 0o700 });
  try { await mkdir(lock); }
  catch {
    let previous: number;
    try { previous = Number(await readFile(join(lock, 'pid'), 'utf8')); }
    catch { throw new Error('The supervisor lock is incomplete. Remove it only after verifying no Devenv supervisor is running.'); }
    if (previous > 1 && alive(previous)) throw new Error(`Previous supervisor (${previous}) is still cleaning up. Reopen Devenv shortly.`);
    await rm(lock, { recursive: true, force: true }); await mkdir(lock);
  }
  await writeFile(join(lock, 'pid'), String(process.pid), { mode: 0o600 });
  const env = await shellEnvironment(initialShell);
  engine = new Engine(root, initialShell, env);
  installer = new Installer(initialShell, env, () => engine.stop());
  installer.on('state', state => send({ event: 'install-state', state }));
  installer.on('output', output => send({ event: 'install-output', output }));
  engine.on('state', session => send({ event: 'state', session }));
  engine.on('log', entry => send({ event: 'log', entry }));
  await engine.recover();
}
const ready = initialize();
ready.then(() => send({ event: 'ready' }), error => send({ event: 'fatal', error: message(error) }));
process.on('message', async (request: { id: number; method: string; value?: string }) => {
  try {
    await ready;
    let value: unknown;
    switch (request.method) {
      case 'start': if (installer.state?.status === 'running') throw new Error('Wait for installation to finish.'); if (!(await installer.check(request.value!))) throw new Error('Install this project before running it.'); value = await engine.start(request.value!); break;
      case 'start-service': {
        const target = JSON.parse(request.value!) as { path: string; name: string };
        if (installer.state?.status === 'running') throw new Error('Wait for installation to finish.');
        if (!(await installer.check(target.path))) throw new Error('Install this project before running it.');
        value = await engine.start(target.path, target.name); break;
      }
      case 'start-one': value = await engine.startOne(request.value!); break;
      case 'start-all': value = await engine.startAll(); break;
      case 'stop': value = await engine.stop(); break;
      case 'install': { const target = JSON.parse(request.value!) as { path: string; mode: 'resume' | 'restart' }; value = await installer.install(target.path, target.mode); break; }
      case 'install-cancel': installer.cancel(); break;
      case 'install-input': installer.input(request.value!); break;
      case 'install-resize': { const size = JSON.parse(request.value!) as { cols: number; rows: number }; installer.resize(size.cols, size.rows); break; }
      case 'stop-one': value = await engine.stopOne(request.value!); break;
      case 'restart': value = await engine.restart(request.value!); break;
      case 'logs': value = engine.logs?.read(request.value) ?? []; break;
      case 'log-directory': value = engine.logs?.directory; break;
      case 'shell': { const env = await shellEnvironment(request.value!); engine.configure(request.value!, env); installer.configure(request.value!, env); break; }
      default: throw new Error('Unknown supervisor method');
    }
    send({ id: request.id, value });
  } catch (error) { send({ id: request.id, error: message(error) }); }
});
async function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  try { await ready; await installer.shutdown(); await engine.stop(); }
  catch (error) { console.error(message(error)); }
  finally {
    // Only release our own lock, never a newer supervisor's.
    if (await readFile(join(lock, 'pid'), 'utf8').catch(() => '') === String(process.pid)) await rm(lock, { recursive: true, force: true });
    process.exit(0);
  }
}
process.once('disconnect', () => void shutdown());
process.once('SIGTERM', () => void shutdown());
process.once('SIGINT', () => void shutdown());
