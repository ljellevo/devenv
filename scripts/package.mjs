import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
// Reuse the Electron binary installed by npm; avoid downloading it a second time.
const result = spawnSync(process.execPath, ['node_modules/electron-builder/cli.js', '--mac', 'dir', `--${process.arch}`, `-c.electronDist=${resolve('node_modules/electron/dist')}`, '-c.mac.identity=-', '-c.mac.hardenedRuntime=false', '--publish', 'never'], { stdio: 'inherit' });
process.exit(result.status ?? 1);
