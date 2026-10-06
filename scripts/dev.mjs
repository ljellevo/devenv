import { spawn } from 'node:child_process';
import { createServer } from 'vite';
await import('./build.mjs');
const server = await createServer();
await server.listen();
const child = spawn('node_modules/.bin/electron', ['.'], { stdio: 'inherit', env: { ...process.env, DEVENV_RENDERER_URL: 'http://127.0.0.1:4783' } });
child.on('exit', async code => { await server.close(); process.exit(code ?? 0); });
process.on('SIGINT', () => child.kill('SIGINT'));
process.on('SIGTERM', () => child.kill('SIGTERM'));
