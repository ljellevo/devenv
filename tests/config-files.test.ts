import { afterEach, expect, test } from 'vitest';
import { mkdtemp, readFile, rm, writeFile, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readConfigDocument, saveConfigDocument } from '../src/core/config-files';

const dirs: string[] = [];
afterEach(async () => { await Promise.all(dirs.splice(0).map(path => rm(path, { recursive: true, force: true }))); });

async function fixture() {
  const directory = await realpath(await mkdtemp(join(tmpdir(), 'devenv-editor-')));
  dirs.push(directory);
  const path = join(directory, 'devenv.toml');
  const text = 'version = 1\nname = "Example"\n\n[services.web]\ncommand = "npm run dev"\n';
  await writeFile(path, text);
  return { path, text };
}

test('saves a valid configuration with an updated revision', async () => {
  const { path, text } = await fixture();
  const initial = await readConfigDocument(path);
  const edited = text.replace('Example', 'Updated');
  const saved = await saveConfigDocument(path, edited, initial.revision);
  expect(saved.text).toBe(edited);
  expect(saved.revision).not.toBe(initial.revision);
  expect(await readFile(path, 'utf8')).toBe(edited);
});

test('rejects invalid edits and changes made outside the editor', async () => {
  const { path, text } = await fixture();
  const initial = await readConfigDocument(path);
  await expect(saveConfigDocument(path, 'invalid TOML = [', initial.revision)).rejects.toThrow();
  expect(await readFile(path, 'utf8')).toBe(text);
  await writeFile(path, text.replace('Example', 'External'));
  await expect(saveConfigDocument(path, text.replace('Example', 'Editor'), initial.revision)).rejects.toThrow('changed on disk');
  expect(await readFile(path, 'utf8')).toContain('External');
});
