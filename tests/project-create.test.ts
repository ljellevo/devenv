import { afterEach, expect, test } from 'vitest';
import { mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { coveredBySearchRoot, createProjectConfig, writeAgentGuide } from '../src/core/project-create';
import { discover } from '../src/core/config';

const directories: string[] = [];
afterEach(async () => { await Promise.all(directories.splice(0).map(directory => rm(directory, { recursive: true, force: true }))); });

test('creates an empty config that appears in project discovery for editing', async () => {
  const directory = await realpath(await mkdtemp(join(tmpdir(), 'devenv-new-project-')));
  directories.push(directory);
  const file = await createProjectConfig(directory);
  expect(await readFile(file, 'utf8')).toBe('');
  const { projects } = await discover([directory]);
  expect(projects).toHaveLength(1);
  expect(projects[0]).toMatchObject({ path: file, name: basename(directory), services: [], draft: true });
  expect(projects[0].error).toBeUndefined();

  await writeFile(file, 'version = 1\nname = "Configured"\n[services.web]\ncommand = "npm run dev"\n');
  const configured = await discover([directory]);
  expect(configured.projects[0].name).toBe('Configured');
  expect(configured.projects[0].draft).toBeUndefined();
  expect(configured.projects[0].error).toBeUndefined();
  expect(configured.projects[0].services).toHaveLength(1);
});

test('never overwrites an existing config', async () => {
  const directory = await realpath(await mkdtemp(join(tmpdir(), 'devenv-existing-project-')));
  directories.push(directory);
  const file = join(directory, 'devenv.toml');
  await writeFile(file, 'original');
  await expect(createProjectConfig(directory)).rejects.toThrow('already contains');
  expect(await readFile(file, 'utf8')).toBe('original');
});

test('uses an existing search root for nested projects and resolves root aliases', async () => {
  const directory = await realpath(await mkdtemp(join(tmpdir(), 'devenv-search-root-')));
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

test('writes an AGENTS.md that tells the agent to keep devenv.toml current, without replacing existing instructions', async () => {
  const directory = await realpath(await mkdtemp(join(tmpdir(), 'devenv-agent-guide-')));
  directories.push(directory);
  const file = await writeAgentGuide(directory);
  expect(file).toBe(join(directory, 'AGENTS.md'));
  const created = await readFile(file, 'utf8');
  expect(created).toMatch(/^# Agent instructions\n\n## Devenv\n/);
  expect(created).toContain('**Always keep `devenv.toml` up to date.**');
  expect(created).toMatch(/installed or run, update `devenv\.toml` in the same change/);
  expect(created).toContain('[[install.steps]]');
  // Running it again changes nothing.
  await writeAgentGuide(directory);
  expect(await readFile(file, 'utf8')).toBe(created);

  await writeFile(file, '# Our rules\n\nUse tabs.\n');
  await writeAgentGuide(directory);
  const appended = await readFile(file, 'utf8');
  expect(appended).toMatch(/^# Our rules\n\nUse tabs\.\n\n## Devenv\n/);
  expect(appended.match(/^## Devenv$/gm)).toHaveLength(1);
  await writeAgentGuide(directory);
  expect(await readFile(file, 'utf8')).toBe(appended);
});

test('the example in the agent guide is a valid project', async () => {
  const directory = await realpath(await mkdtemp(join(tmpdir(), 'devenv-agent-example-')));
  directories.push(directory);
  await mkdir(join(directory, 'api'));
  const guide = await readFile(await writeAgentGuide(directory), 'utf8');
  await writeFile(join(directory, 'devenv.toml'), guide.match(/```toml\n([\s\S]*?)```/)![1]);
  const { projects } = await discover([directory]);
  expect(projects[0].error).toBeUndefined();
  expect(projects[0].services.map(service => service.name)).toEqual(['db', 'api']);
  expect(projects[0].install?.steps.map(step => step.id)).toEqual(['dependencies']);
});
