import { describe, it, expect, afterEach } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm, symlink, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { discover, loadProject } from '../src/core/config';
const roots: string[] = [];
// realpath matches discovery, including macOS /private/var and Windows 8.3 temp names.
async function fixture() { const root = await realpath(await mkdtemp(join(tmpdir(), 'devenv-config-'))); roots.push(root); return root; }
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });
describe('configuration discovery', () => {
  it('accepts the Dealroom install recipe and keeps it uninstalled until recorded', async () => {
    const project = await loadProject(resolve('examples/dealroom.toml'));
    expect(project.install?.steps.map(step => step.id)).toEqual(['dependencies', 'environment', 'databases', 'api-migration', 'auth-migration', 'stop-install-databases']);
    expect(project.installed).toBe(false);
  });
  it('finds resources configs, resolves relative paths, deduplicates roots, and excludes dependencies, hidden folders, and symlinks', async () => {
    const root = await fixture();
    for (const dir of ['resources', 'api', 'node_modules/huge', 'build', 'archive', '.claude/worktrees/feature']) await mkdir(join(root, dir), { recursive: true });
    const config = 'version=1\nname="Example"\n[services.api]\ncwd="../api"\ncommand="npm run dev"\nports=[3100]\n';
    await writeFile(join(root, 'resources/devenv.toml'), config);
    await writeFile(join(root, 'node_modules/huge/devenv.toml'), config);
    await writeFile(join(root, 'archive/devenv.toml'), config);
    await writeFile(join(root, '.claude/worktrees/feature/devenv.toml'), config);
    await symlink(root, join(root, 'resources/loop'));
    const result = await discover([root, join(root, 'resources')], ['archive']);
    expect(result.errors).toEqual([]); expect(result.projects).toHaveLength(1);
    expect(result.projects[0].services[0].cwd).toBe(join(root, 'api'));
  });
  it.each([
    ['duplicate ports', '[services.b]\ncommand="true"\nports=[3100]', /Port 3100/],
    ['missing dependency', 'depends_on=["missing"]', /missing or disabled/],
    ['cycle', 'depends_on=["b"]\n[services.b]\ncommand="true"\ndepends_on=["a"]', /cycle/],
    ['background cleanup', 'mode="background"', /stop_command/],
    ['unknown fields', 'comand="typo"', /Unrecognized key/],
  ])('rejects %s', async (_label, extra, error) => {
    const root = await fixture(), file = join(root, 'devenv.toml');
    await writeFile(file, `version=1\nname="Test"\n[services.a]\ncommand="true"\nports=[3100]\n${extra}\n`);
    await expect(loadProject(file)).rejects.toThrow(error);
  });
  it('reports invalid files alongside valid projects without executing commands', async () => {
    const root = await fixture(); await mkdir(join(root, 'other'));
    await writeFile(join(root, 'devenv.toml'), 'broken = [');
    await writeFile(join(root, 'other/devenv.toml'), 'version=1\nname="Valid"\n[services.a]\ncommand="touch SHOULD_NOT_EXIST"\n');
    const result = await discover([root]);
    expect(result.projects).toHaveLength(2); expect(result.projects.filter(p => p.error)).toHaveLength(1);
  });
});
