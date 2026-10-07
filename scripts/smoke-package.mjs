import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
const executable = process.platform === 'darwin' ? resolve(`release/${process.arch === 'arm64' ? 'mac-arm64' : 'mac'}/Devenv.app/Contents/MacOS/Devenv`) : process.platform === 'win32' ? resolve('release/win-unpacked/Devenv.exe') : resolve('release/linux-unpacked/devenv');
const profile = await mkdtemp(join(tmpdir(), 'devenv-package-smoke-'));
const child = spawn(executable, ['--devenv-smoke-test', `--user-data-dir=${profile}`], { env: { ...process.env, DEVENV_SMOKE_TEST: '1' }, stdio: 'inherit' });
try {
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => { child.kill(); reject(new Error('Packaged smoke test timed out')); }, 30000);
    child.once('error', error => { clearTimeout(timer); reject(error); });
    child.once('exit', (code, signal) => { clearTimeout(timer); code === 0 ? resolve() : reject(new Error(`Packaged smoke test exited ${code ?? `by ${signal}`}`)); });
  });
} finally { await rm(profile, { recursive: true, force: true }); }
