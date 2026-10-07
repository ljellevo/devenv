import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
// Reuse the Electron binary installed by npm; avoid downloading it a second time.
const result = spawnSync(process.execPath, ['node_modules/electron-builder/cli.js', process.platform === 'darwin' ? '--mac' : process.platform === 'win32' ? '--win' : '--linux', 'dir', `--${process.arch}`, `-c.electronDist=${resolve('node_modules/electron/dist')}`, '--publish', 'never'], { stdio: 'inherit' });
process.exit(result.status ?? 1);
