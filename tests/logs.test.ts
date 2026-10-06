import { it, expect } from 'vitest';
import { mkdtemp, readdir, rm, stat, access } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Logs } from '../src/core/logs';
it('bounds active logs and UI memory while preserving session completion', async () => {
  const root = await mkdtemp(join(tmpdir(), 'devenv-logs-'));
  try {
    const logs = new Logs(root, 'session', () => {});
    for (let i = 0; i < 180; i++) logs.write('api', 'stdout', 'x'.repeat(16000));
    expect(logs.read().reduce((n, entry) => n + entry.text.length, 0)).toBeLessThanOrEqual(2 * 1024 * 1024);
    const files = await readdir(logs.directory);
    expect(files).toContain('api.jsonl.1');
    for (const file of files) expect((await stat(join(logs.directory, file))).size).toBeLessThan(1100000);
    logs.finish(); await expect(access(join(logs.directory, 'active'))).rejects.toThrow();
  } finally { await rm(root, { recursive: true, force: true }); }
});
