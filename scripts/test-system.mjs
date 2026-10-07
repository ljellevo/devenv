import { spawnSync } from 'node:child_process';
const result = spawnSync(process.execPath, ['node_modules/vitest/vitest.mjs', 'run', process.platform === 'win32' ? 'tests/windows-lifecycle.test.ts' : 'tests/engine.test.ts'], { stdio: 'inherit', env: { ...process.env, DEVENV_TEST_OS: '1' } });
process.exit(result.status ?? 1);
