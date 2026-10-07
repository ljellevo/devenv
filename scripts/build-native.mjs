import { spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
if (process.platform === 'win32') {
  mkdirSync('dist/native', { recursive: true });
  const result = spawnSync('cl.exe', ['/nologo', '/EHsc', '/std:c++17', '/O2', '/MT', 'native/windows/job.cpp', '/Fedist/native/devenv-job.exe', '/Fodist/native/job.obj'], { stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status) process.exit(result.status);
}
