import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Engine } from './engine';
import { alive, message, shellEnvironment } from './process';

const [root, initialShell] = process.argv.slice(2);
let engine: Engine;
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
      case 'start': value = await engine.start(request.value!); break;
      case 'start-service': {
        const target = JSON.parse(request.value!) as { path: string; name: string };
        value = await engine.start(target.path, target.name); break;
      }
      case 'start-one': value = await engine.startOne(request.value!); break;
      case 'start-all': value = await engine.startAll(); break;
      case 'stop': value = await engine.stop(); break;
      case 'stop-one': value = await engine.stopOne(request.value!); break;
      case 'restart': value = await engine.restart(request.value!); break;
      case 'logs': value = engine.logs?.read(request.value) ?? []; break;
      case 'log-directory': value = engine.logs?.directory; break;
      case 'shell': engine.configure(request.value!, await shellEnvironment(request.value!)); break;
      default: throw new Error('Unknown supervisor method');
    }
    send({ id: request.id, value });
  } catch (error) { send({ id: request.id, error: message(error) }); }
});
async function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  try { await ready; await engine.stop(); }
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
