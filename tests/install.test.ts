import { afterEach, expect, it as testCase } from 'vitest';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { discover, loadProject } from '../src/core/config';
import { Installer } from '../src/core/installer';

const it = process.platform === 'win32' ? testCase.skip : testCase;
const roots: string[] = [];
async function fixture(steps: string, check = 'test -f installed') {
  const root = await mkdtemp(join(tmpdir(), 'devenv-install-')); roots.push(root);
  const file = join(root, 'devenv.toml');
  await writeFile(file, `version=1\nname="Fixture"\n[services.app]\ncommand="true"\ncwd="./generated"\n[install]\ncheck_command="${check}"\n${steps}`);
  return { root, file };
}
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });

it('discovers uninstalled projects without executing commands and allows install-created paths', async () => {
  const { root, file } = await fixture('[[install.steps]]\nid="setup"\ncommand="mkdir generated; touch installed"\n');
  const project = await loadProject(file);
  expect(project.install?.steps[0].cwd).toBe(root.replace(/^\/var\//, '/private/var/'));
  expect(project.installed).toBe(false);
  expect((await discover([root])).projects[0].error).toBeUndefined();
  await expect(readFile(join(root, 'installed'))).rejects.toThrow();
});

it('records successful steps, ignores the record in git, and keeps a changed recipe installed', async () => {
  const { root, file } = await fixture('[[install.steps]]\nid="setup"\ncommand="mkdir generated; touch installed"\n');
  const installer = new Installer('/bin/sh', process.env, async () => {});
  await installer.install(file, 'resume');
  expect((await loadProject(file)).installed).toBe(true);
  expect(await readFile(join(root, '.gitignore'), 'utf8')).toContain('.devenv/');
  expect((await readFile(join(root, '.devenv/install.json'), 'utf8'))).toContain('"installed": true');
  expect(await installer.check(file)).toBe(true);
  expect((await loadProject(file)).installOutdated).toBe(false);
  await writeFile(file, (await readFile(file, 'utf8')).replace('touch installed', 'touch installed; touch second'));
  const changed = await loadProject(file);
  expect(changed.installed).toBe(true);
  expect(changed.installOutdated).toBe(true);
  expect(await installer.check(file)).toBe(true);
  await installer.install(file, 'restart');
  expect((await loadProject(file)).installOutdated).toBe(false);
  await expect(readFile(join(root, 'second'))).resolves.toBeDefined();
});

it('recognizes an already installed clone through its check and keeps the record when the check later fails', async () => {
  const { root, file } = await fixture('[[install.steps]]\nid="setup"\ncommand="mkdir generated; touch installed"\n');
  await writeFile(join(root, 'installed'), '');
  const installer = new Installer('/bin/sh', process.env, async () => { throw new Error('Should not stop another project'); });
  await installer.install(file, 'resume');
  expect((await loadProject(file)).installed).toBe(true);
  await rm(join(root, 'installed'));
  expect(await installer.check(file)).toBe(true);
  expect((await loadProject(file)).installed).toBe(true);
});

it('runs the check without a record, and still after a cancelled install', async () => {
  const slow = await fixture('[[install.steps]]\nid="wait"\ncommand="sleep 30"\n');
  const installer = new Installer('/bin/sh', process.env, async () => {});
  installer.on('state', state => { if (state?.stepId === 'wait' && state.status === 'running') setTimeout(() => installer.cancel(), 100); });
  await expect(installer.install(slow.file, 'resume')).rejects.toThrow();
  const { root, file } = await fixture('[[install.steps]]\nid="setup"\ncommand="mkdir generated; touch installed"\n');
  expect(await installer.check(file)).toBe(false);
  await writeFile(join(root, 'installed'), '');
  expect(await installer.check(file)).toBe(true);
  expect((await loadProject(file)).installed).toBe(true);
});

it('does not mark a recipe installed when its final check fails', async () => {
  const { file } = await fixture('[[install.steps]]\nid="setup"\ncommand="mkdir generated"\n');
  const installer = new Installer('/bin/sh', process.env, async () => {});
  await expect(installer.install(file, 'resume')).rejects.toThrow('check_command');
  expect((await loadProject(file)).installed).toBe(false);
});

it('resumes after a failed step and accepts terminal input', async () => {
  const { root, file } = await fixture(`[[install.steps]]
id="first"
command="mkdir generated"
[[install.steps]]
id="second"
command='read answer; test "$answer" = yes && touch installed'
interactive=true
`);
  const installer = new Installer('/bin/sh', process.env, async () => {});
  installer.on('state', state => { if (state?.stepId === 'second' && state.status === 'running') setTimeout(() => installer.input('no\r'), 100); });
  await expect(installer.install(file, 'resume')).rejects.toThrow('second');
  expect((await readFile(join(root, '.devenv/install.json'), 'utf8'))).toContain('"first"');
  installer.removeAllListeners('state');
  installer.on('state', state => { if (state?.stepId === 'second' && state.status === 'running') setTimeout(() => installer.input('yes\r'), 100); });
  await installer.install(file, 'resume');
  expect((await loadProject(file)).installed).toBe(true);
});
