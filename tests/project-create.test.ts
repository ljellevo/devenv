import { afterEach, expect, test } from 'vitest';
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { coveredBySearchRoot, createProjectConfig } from '../src/core/project-create';
import { discover } from '../src/core/config';

const directories: string[] = [];
afterEach(async () => { await Promise.all(directories.splice(0).map(directory => rm(directory, { recursive: true, force: true }))); });

test('creates an empty config that appears in project discovery for editing', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'devenv-new-project-'));
  directories.push(directory);
  const file = await createProjectConfig(directory);
  expect(await readFile(file, 'utf8')).toBe('');
  const { projects } = await discover([directory]);
  expect(projects).toHaveLength(1);
  expect(projects[0]).toMatchObject({ path: file, name: directory.split('/').at(-1), services: [], draft: true });
  expect(projects[0].error).toBeUndefined();

  await writeFile(file, 'version = 1\nname = "Configured"\n[services.web]\ncommand = "npm run dev"\n');
  const configured = await discover([directory]);
  expect(configured.projects[0].name).toBe('Configured');
  expect(configured.projects[0].draft).toBeUndefined();
  expect(configured.projects[0].error).toBeUndefined();
  expect(configured.projects[0].services).toHaveLength(1);
});

test('never overwrites an existing config', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'devenv-existing-project-'));
  directories.push(directory);
  const file = join(directory, 'devenv.toml');
  await writeFile(file, 'original');
  await expect(createProjectConfig(directory)).rejects.toThrow('already contains');
  expect(await readFile(file, 'utf8')).toBe('original');
});

test('uses an existing search root for nested projects and resolves root aliases', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'devenv-search-root-'));
  directories.push(directory);
  const project = join(directory, 'apps', 'sample');
  const sibling = join(directory, 'apps-other');
  await mkdir(project, { recursive: true });
  await mkdir(sibling);
  const alias = join(directory, 'alias');
  await symlink(join(directory, 'apps'), alias);
  expect(await coveredBySearchRoot(project, [join(directory, 'apps')])).toBe(true);
  expect(await coveredBySearchRoot(project, [alias])).toBe(true);
  expect(await coveredBySearchRoot(sibling, [join(directory, 'apps')])).toBe(false);
  expect(await coveredBySearchRoot(project, [sibling])).toBe(false);
});
