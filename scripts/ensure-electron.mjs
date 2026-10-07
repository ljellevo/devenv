import { existsSync, chmodSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
if (!existsSync('node_modules/electron/path.txt')) {
  const result = spawnSync(process.execPath, ['node_modules/electron/install.js'], { stdio: 'inherit', env: process.env });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
// Some npm installations omit node-pty's install script and unpack its macOS
// helper without the executable bit. The PTY cannot launch a shell then.
for (const arch of ['arm64', 'x64']) {
  const helper = `node_modules/node-pty/prebuilds/darwin-${arch}/spawn-helper`;
  if (existsSync(helper)) chmodSync(helper, 0o755);
}
