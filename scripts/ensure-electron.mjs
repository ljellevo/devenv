import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
if (!existsSync('node_modules/electron/path.txt')) {
  const result = spawnSync(process.execPath, ['node_modules/electron/install.js'], { stdio: 'inherit', env: process.env });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
