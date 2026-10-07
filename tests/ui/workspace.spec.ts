import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';

test.beforeEach(async ({ page }) => {
  // Serve the built renderer through Playwright's routing, without binding a local port.
  await page.route('http://devenv.test/**', async route => {
    const pathname = new URL(route.request().url()).pathname;
    const file = resolve('dist/renderer', '.' + (pathname === '/' ? '/index.html' : pathname));
    if (!file.startsWith(resolve('dist/renderer') + '/')) return route.abort();
    const types: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
    await route.fulfill({ body: await readFile(file), contentType: types[extname(file)] ?? 'application/octet-stream' });
  });
  await page.addInitScript(() => {
    // http://devenv.test is not a secure context, so randomUUID is missing; the Electron renderer has it.
    if (!crypto.randomUUID) (crypto as any).randomUUID = () => '10000000-1000-4000-8000-100000000000'.replace(/[018]/g, c => (+c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> +c / 4).toString(16));
    const service = (name: string, port: number) => ({ name, cwd: '/projects/intivo/' + name, command: 'npm run dev', ports: [port], depends_on: [], enabled: true, mode: 'process', env: {}, startup_timeout: 60, stop_timeout: 15, allow_successful_exit: false });
    const projects: any[] = [{ id: 'intivo', path: '/Users/developer/code/intivo/resources/devenv.toml', name: 'Intivo', services: [service('postgres', 5433), service('documents', 3200), service('api', 3100), service('web', 5173), service('admin', 5174), service('home', 3000)] }, { id: 'dealroom', path: '/Users/developer/code/dealroom/resources/devenv.toml', name: 'Dealroom', services: [service('api', 3100), service('auth', 3200), service('app', 3000)] }];
    if (new URLSearchParams(location.search).has('empty')) projects.splice(0);
    if (new URLSearchParams(location.search).has('install')) { projects[1].install = { cwd: '/Users/developer/code/dealroom/resources', steps: [{ id: 'dependencies', command: 'npm install', cwd: '/Users/developer/code/dealroom/resources', env: {}, timeout: 1800, interactive: true }], recipeHash: 'test' }; projects[1].installed = true; }
    const defaultSettings = { roots: ['/Users/developer/code'], exclusions: [], shell: '/bin/zsh', releaseRepo: 'ljellevo/devenv', appearance: 'dark', projectFolders: [], projectFolderAssignments: {}, projectTreeOrder: {}, sidebarPinned: false, onboardingCompleted: true };
    if (new URLSearchParams(location.search).has('onboarding')) Object.assign(defaultSettings, { roots: [], appearance: 'system', onboardingCompleted: false });
    const state: any = { projects, settings: JSON.parse(localStorage.getItem('devenv-test-settings') || JSON.stringify(defaultSettings)), session: null, scanning: false, scanErrors: [], update: { status: 'idle', current: '0.1.0' }, hasToken: false };
    let listener = (_: any) => {}, logListener = (_: any) => {};
    (window as any).calls = [];
    window.devenv = {
      state: async () => structuredClone(state), onState: callback => { listener = callback; return () => {}; }, onLog: callback => { logListener = callback; return () => {}; }, onInstallOutput: () => () => {},
      scan: async () => {}, addFolder: async () => { state.settings = { ...state.settings, roots: [...state.settings.roots, '/Users/developer/projects'] }; listener(structuredClone(state)); }, createProject: async () => { const created = { id: 'new-project', path: '/Users/developer/code/New Project/devenv.toml', name: 'New Project', services: [], draft: true }; projects.push(created); state.projects = projects; listener(structuredClone(state)); return { id: created.id, path: created.path }; },
      start: async id => { (window as any).calls.push(['start', id]); const project = projects.find(p => p.id === id)!; state.session = { id: 'session-' + id, project, status: 'running', startedAt: new Date().toISOString(), services: project.services.map((s: any) => ({ name: s.name, status: 'ready', pid: 123 })) }; listener(structuredClone(state)); setTimeout(() => logListener({ seq: 1, time: new Date().toISOString(), service: 'api', stream: 'stdout', text: 'API listening on http://localhost:3100\n' }), 100); },
      install: async (id, mode) => { (window as any).calls.push(['install', id, mode]); }, cancelInstall: async () => {}, installInput: async () => {}, installResize: async () => {},
      stop: async () => { (window as any).calls.push(['stop']); state.session.status = 'stopped'; state.session.services.forEach((s: any) => s.status = 'stopped'); listener(structuredClone(state)); },
      startService: async (id, name) => { (window as any).calls.push(['start-service', id, name]); }, stopService: async (id, name) => { (window as any).calls.push(['stop-service', id, name]); },
      logs: async () => [], restart: async () => {}, openTerminal: async () => { (window as any).calls.push(['terminal']); },
      openConfigFinder: async id => { (window as any).calls.push(['finder', id]); }, openConfigTerminal: async id => { (window as any).calls.push(['config-terminal', id]); },
      readConfig: async id => ({ path: projects.find(p => p.id === id)!.path, text: 'version = 1\nname = "Intivo"\n\n[services.api]\ncwd = "."\ncommand = "npm run dev"\n', revision: '0'.repeat(64) }),
      validateConfig: async () => ({ valid: true }), saveConfig: async (id, text) => ({ path: projects.find(p => p.id === id)!.path, text, revision: '1'.repeat(64) }),
      saveSettings: async settings => { state.settings = settings; localStorage.setItem('devenv-test-settings', JSON.stringify(settings)); listener(structuredClone(state)); }, saveToken: async token => { state.hasToken = !!token; listener(structuredClone(state)); },
      checkUpdate: async () => { state.update = { current: '0.1.0', status: 'available', latest: 'v0.2.0', notes: 'Better session cleanup.' }; listener(structuredClone(state)); }, installUpdate: async () => { (window as any).calls.push(['update']); },
    };
  });
});

test('shows the empty workspace when there is no project or installation', async ({ page }) => {
  await page.goto('/?empty');
  await expect(page.getByRole('heading', { name: 'Your projects, in one place.' })).toBeVisible();
});

test('shows Reinstall project in the Run project action menu', async ({ page }) => {
  await page.goto('/?install');
  await page.mouse.move(2, 100);
  await page.getByRole('navigation', { name: 'Projects' }).getByRole('button', { name: /Dealroom/ }).click();
  await expect(page.getByRole('button', { name: 'Run project' })).toBeVisible();
  await page.getByRole('button', { name: 'Project actions' }).click();
  await page.getByRole('menuitem', { name: 'Reinstall project' }).click();
  expect(await page.evaluate(() => (window as any).calls)).toEqual([['install', 'dealroom', 'restart']]);
});

test('start, view logs, open Ghostty, switch, and stop through the shared API', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Intivo', exact: true })).toBeVisible();
  await page.mouse.move(2, 100);
  await expect(page.getByRole('navigation', { name: 'Projects' }).getByText('Stopped · 6 services')).toBeVisible();
  await page.getByRole('button', { name: 'Run project', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Project actions' })).toHaveCount(0);
  await expect(page.getByRole('navigation', { name: 'Projects' }).getByText('Running · 6 services')).toBeVisible();
  await page.getByRole('tab', { name: 'Terminal' }).click();
  await expect(page.getByText('API listening on http://localhost:3100')).toBeVisible();
  await page.getByRole('button', { name: 'Open in Ghostty' }).click();
  await page.screenshot({ path: 'test-results/workspace.png' });
  await page.mouse.move(2, 100);
  await page.getByRole('navigation', { name: 'Projects' }).getByRole('button', { name: /Dealroom/ }).click();
  await page.getByRole('button', { name: 'Run project' }).click();
  await page.getByRole('button', { name: 'Stop project' }).click();
  expect(await page.evaluate(() => (window as any).calls)).toEqual([['start', 'intivo'], ['terminal'], ['start', 'dealroom'], ['stop']]);
});

test('settings expose release checks and require an explicit install action', async ({ page }) => {
  await page.goto('/'); await page.mouse.move(2, 100); await page.getByRole('button', { name: /Settings/ }).click();
  await page.getByRole('tab', { name: /Updates/ }).click();
  await page.getByRole('button', { name: 'Check for updates' }).click();
  await expect(page.getByText('Version v0.2.0 is available')).toBeVisible();
  await page.getByRole('button', { name: 'Download & install' }).click();
  await expect(page.getByRole('heading', { name: 'Install the update' })).toBeVisible();
  expect(await page.evaluate(() => (window as any).calls)).toEqual([]);
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  expect(await page.evaluate(() => (window as any).calls)).toEqual([]);
  await page.keyboard.press('Escape');
  await page.mouse.move(2, 100);
  await page.getByRole('button', { name: /Update available.*Devenv v0.2.0/ }).click();
  await expect(page.getByText('Version v0.2.0 is available')).toBeVisible();
});

test('organize projects in persistent nested folders', async ({ page }) => {
  await page.goto('/');
  await page.mouse.move(2, 100);
  await page.getByRole('button', { name: 'New project folder' }).click();
  await page.getByRole('textbox', { name: 'Folder name' }).fill('Clients');
  await page.getByRole('button', { name: 'Save folder' }).click();
  await expect(page.getByRole('button', { name: /Collapse Clients/ })).toBeVisible();
  await page.getByRole('button', { name: 'New folder in Clients' }).click();
  await page.getByRole('textbox', { name: 'Folder name' }).fill('Active');
  await page.getByRole('button', { name: 'Save folder' }).click();
  await page.getByRole('navigation', { name: 'Projects' }).getByRole('button', { name: /Intivo/ }).dragTo(page.getByRole('button', { name: 'Collapse Active' }));
  const tree = page.getByRole('navigation', { name: 'Projects' });
  await expect(tree.getByText('Intivo', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => (window as any).devenv.state().then((state: any) => state.settings.projectFolderAssignments.intivo))).toBeTruthy();
  await tree.getByRole('button', { name: /Dealroom/ }).dragTo(tree.getByRole('button', { name: /Collapse Clients/ }), { targetPosition: { x: 20, y: 2 } });
  await expect(tree.getByText('Dealroom', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => (window as any).devenv.state().then((state: any) => state.settings.projectTreeOrder.root[0]))).toBe('p:dealroom');
  await page.getByRole('button', { name: 'Collapse Clients' }).click();
  await expect(tree.getByText('Intivo', { exact: true })).toBeHidden();
  await page.reload();
  await page.mouse.move(2, 100);
  await expect(page.getByRole('button', { name: 'Collapse Clients' })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Projects' }).getByText('Intivo', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => (window as any).devenv.state().then((state: any) => state.settings.projectTreeOrder.root[0]))).toBe('p:dealroom');
});

test('folder actions appear on hover and the sidebar can be pinned open', async ({ page }) => {
  await page.goto('/');
  await page.mouse.move(2, 100);
  await page.getByRole('button', { name: 'New project folder' }).click();
  await page.getByRole('textbox', { name: 'Folder name' }).fill('Clients');
  await page.getByRole('button', { name: 'Save folder' }).click();
  const rename = page.getByRole('button', { name: 'Rename Clients' });
  await expect(rename).toHaveCSS('opacity', '0');
  await page.getByRole('button', { name: /Collapse Clients/ }).hover();
  await expect(rename).toHaveCSS('opacity', '1');
  await page.getByRole('button', { name: 'Pin sidebar open' }).click();
  await page.mouse.move(900, 400);
  await expect(page.getByRole('navigation', { name: 'Projects' })).toBeInViewport();
  await page.reload();
  await expect(page.getByRole('navigation', { name: 'Projects' })).toBeInViewport();
  await page.getByRole('button', { name: 'Unpin sidebar' }).click();
  await page.mouse.move(900, 400);
  await expect(page.getByRole('navigation', { name: 'Projects' })).not.toBeInViewport();
});

test('command menu opens from the header and shortcut, and Help is available', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Search projects and commands' }).click();
  const menu = page.getByRole('dialog', { name: 'Commands' });
  await expect(menu.getByRole('option', { name: /Add a project/ })).toBeVisible();
  await expect(menu.getByRole('option', { name: /Intivo.*Stopped.*6 services/ })).toBeVisible();
  await menu.getByRole('option', { name: /Dealroom/ }).click();
  await expect(page.getByRole('heading', { name: 'Dealroom', exact: true })).toBeVisible();
  await page.keyboard.press('Meta+k');
  await menu.getByRole('option', { name: 'Help' }).click();
  await expect(page.getByRole('dialog', { name: 'Help' }).getByRole('heading', { name: 'Run projects and services' })).toBeVisible();
});

test('adding a project opens a copyable setup prompt and its Config tab', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Search projects and commands' }).click();
  await page.getByRole('option', { name: 'Add a project' }).click();
  const dialog = page.getByRole('dialog', { name: 'Finish your project configuration' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('textbox', { name: 'Agent setup prompt' })).toHaveValue(/\/Users\/developer\/code\/New Project\/devenv\.toml/);
  await dialog.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(page.getByRole('tab', { name: 'Config' })).toHaveAttribute('data-state', 'active');
  await expect(page.getByRole('heading', { name: 'New Project', exact: true })).toBeVisible();
});

test('first launch walks through the tutorial and asks for a projects folder', async ({ page }) => {
  await page.goto('/?onboarding&empty');
  const tutorial = page.getByRole('dialog');
  await expect(tutorial.getByRole('heading', { name: 'Welcome to Devenv' })).toBeVisible();
  await tutorial.getByRole('button', { name: 'Next' }).click();
  await expect(tutorial.getByRole('heading', { name: 'Light or dark?' })).toBeVisible();
  await expect(tutorial.getByRole('button', { name: 'System' })).toHaveAttribute('aria-pressed', 'true');
  await tutorial.getByRole('button', { name: 'Light' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await expect(tutorial.getByRole('button', { name: 'Light' })).toHaveAttribute('aria-pressed', 'true');
  await tutorial.getByRole('button', { name: 'Next' }).click();
  await expect(tutorial.getByRole('heading', { name: 'Run, watch, and switch' })).toBeVisible();
  await tutorial.getByRole('button', { name: 'Next' }).click();
  await expect(tutorial.getByRole('heading', { name: 'One small file per project' })).toBeVisible();
  await expect(tutorial.getByText(/how they depend on each other/)).toBeVisible();
  await tutorial.getByRole('button', { name: 'Back' }).click();
  await expect(tutorial.getByRole('heading', { name: 'Run, watch, and switch' })).toBeVisible();
  await tutorial.getByRole('button', { name: 'Next' }).click();
  await tutorial.getByRole('button', { name: 'Next' }).click();
  await expect(tutorial.getByRole('heading', { name: 'Where are your projects?' })).toBeVisible();
  await expect(tutorial.getByRole('button', { name: 'Next' })).toBeDisabled();
  await tutorial.getByRole('button', { name: 'Choose folder' }).click();
  await expect(tutorial.getByText('/Users/developer/projects')).toBeVisible();
  await tutorial.getByRole('button', { name: 'Remove /Users/developer/projects' }).click();
  await expect(tutorial.getByText('/Users/developer/projects')).toBeHidden();
  await expect(tutorial.getByRole('button', { name: 'Next' })).toBeDisabled();
  await tutorial.getByRole('button', { name: 'Choose folder' }).click();
  await tutorial.getByRole('button', { name: 'Next' }).click();
  await expect(tutorial.getByRole('heading', { name: 'Want to add a project?' })).toBeVisible();
  await expect(tutorial.getByText(/that project’s own folder/)).toBeVisible();
  await tutorial.getByRole('button', { name: 'Finish' }).click();
  await expect(tutorial).toBeHidden();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('devenv-test-settings')!))).toMatchObject({ roots: ['/Users/developer/projects'], appearance: 'light', onboardingCompleted: true });
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Your projects, in one place.' })).toBeVisible();
  await expect(page.getByRole('dialog')).toBeHidden();
});

test('the tutorial can be skipped without choosing a folder', async ({ page }) => {
  await page.goto('/?onboarding&empty');
  await page.getByRole('dialog').getByRole('button', { name: 'Skip tutorial' }).click();
  await expect(page.getByRole('dialog')).toBeHidden();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('devenv-test-settings')!))).toMatchObject({ roots: [], onboardingCompleted: true });
});

test('the last tutorial step adds a project, shows its setup prompt, and closes', async ({ page }) => {
  await page.goto('/?onboarding&empty');
  const tutorial = page.getByRole('dialog');
  for (let i = 0; i < 4; i++) await tutorial.getByRole('button', { name: 'Next' }).click();
  await tutorial.getByRole('button', { name: 'Skip for now' }).click();
  await tutorial.getByRole('button', { name: 'Add a project' }).click();
  await expect(page.getByRole('dialog', { name: 'Finish your project configuration' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Want to add a project?' })).toBeHidden();
  await expect(page.getByRole('dialog')).toHaveCount(1);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('devenv-test-settings')!))).toMatchObject({ onboardingCompleted: true });
});

test('the System appearance follows the operating system color scheme', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Intivo', exact: true })).toBeVisible();
  await page.mouse.move(2, 100); await page.getByRole('button', { name: /Settings/ }).click();
  const appearance = page.getByRole('group', { name: 'Appearance' });
  await expect(appearance.getByRole('button')).toHaveText(['Light', 'System', 'Dark']);
  await appearance.getByRole('button', { name: 'System' }).click();
  await expect(appearance.getByRole('button', { name: 'System' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.emulateMedia({ colorScheme: 'light' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('devenv-test-settings')!))).toMatchObject({ appearance: 'system' });
});

test('resetting the tutorial in Settings shows it on the next launch', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Intivo', exact: true })).toBeVisible();
  await page.mouse.move(2, 100); await page.getByRole('button', { name: /Settings/ }).click();
  await page.getByRole('button', { name: 'Reset tutorial' }).click();
  await expect(page.getByText('The tutorial will show the next time Devenv launches.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Reset tutorial' })).toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('heading', { name: 'Welcome to Devenv' })).toBeHidden();
  await page.reload();
  const tutorial = page.getByRole('dialog');
  await expect(tutorial.getByRole('heading', { name: 'Welcome to Devenv' })).toBeVisible();
  for (let i = 0; i < 4; i++) await tutorial.getByRole('button', { name: 'Next' }).click();
  await expect(tutorial.getByText('/Users/developer/code')).toBeVisible();
  await tutorial.getByRole('button', { name: 'Next' }).click();
  await tutorial.getByRole('button', { name: 'Finish' }).click();
  await expect(tutorial).toBeHidden();
});

test('Settings fits the default window without scrolling', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.setItem('devenv-test-settings', JSON.stringify({ roots: ['/Users/developer/code', '/Users/developer/work', '/Users/developer/oss'], exclusions: [], shell: '/bin/zsh', releaseRepo: 'ljellevo/devenv', appearance: 'dark', projectFolders: [], projectFolderAssignments: {}, projectTreeOrder: {}, sidebarPinned: false, onboardingCompleted: true })));
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Intivo', exact: true })).toBeVisible();
  await page.mouse.move(2, 100); await page.getByRole('button', { name: /Settings/ }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText('/Users/developer/oss')).toBeVisible();
  for (const tab of ['Workspace', 'Updates']) {
    await dialog.getByRole('tab', { name: tab }).click();
    expect(await dialog.evaluate(el => el.scrollHeight - el.clientHeight), `${tab} tab scrolls`).toBeLessThanOrEqual(0);
  }
});

test('Save workspace settings is enabled only when the workspace settings change', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Intivo', exact: true })).toBeVisible();
  await page.mouse.move(2, 100); await page.getByRole('button', { name: /Settings/ }).click();
  const save = page.getByRole('button', { name: 'Save workspace settings' });
  const exclusions = page.getByLabel('Additional excluded folder names');
  await expect(save).toBeDisabled();
  await exclusions.fill('archive, backups');
  await expect(save).toBeEnabled();
  await exclusions.fill(' , ');
  await expect(save).toBeDisabled();
  await page.getByLabel('Shell').fill('/bin/bash');
  await expect(save).toBeEnabled();
  await save.click();
  await expect(save).toBeDisabled();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('devenv-test-settings')!))).toMatchObject({ shell: '/bin/bash' });
});
