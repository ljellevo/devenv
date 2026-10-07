import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';

test.beforeEach(async ({ page }) => {
  // Serve the built renderer through Playwright's routing, without binding a local port.
  await page.route('http://devenv.test/**', async route => {
    const pathname = new URL(route.request().url()).pathname;
    const file = resolve('dist/renderer', '.' + (pathname === '/' ? '/index.html' : pathname));
    if (!file.startsWith(resolve('dist/renderer') + sep)) return route.abort();
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
    const defaultSettings = { roots: ['/Users/developer/code'], exclusions: [], shell: '/bin/zsh', releaseRepo: 'ljellevo/devenv', appearance: 'dark', terminal: 'ghostty', projectFolders: [], projectFolderAssignments: {}, projectTreeOrder: {}, sidebarPinned: false, onboardingCompleted: true };
    if (new URLSearchParams(location.search).has('onboarding')) Object.assign(defaultSettings, { roots: [], appearance: 'system', terminal: 'terminal', onboardingCompleted: false });
    const state: any = { hostPlatform: new URLSearchParams(location.search).get('platform') || 'macos', projects, settings: JSON.parse(localStorage.getItem('devenv-test-settings') || JSON.stringify(defaultSettings)), session: null, scanning: false, scanErrors: [], update: { status: 'idle', current: '0.1.0' }, hasToken: false, installedTerminals: ['terminal', 'ghostty'] };
    let listener = (_: any) => {}, logListener = (_: any) => {};
    (window as any).calls = [];
    if (new URLSearchParams(location.search).has('wsl')) projects.forEach(project => project.executionTarget = { kind: 'wsl', distribution: 'Ubuntu-24.04' });
    window.devenv = {
      setProjectTarget: async id => id, wslDistributions: async () => [], wslDirectories: async () => ({ path: '/', directories: [] }), addWslFolder: async () => {},
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

test('start, view logs, open the terminal app, switch, and stop through the shared API', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Intivo', exact: true })).toBeVisible();
  await page.mouse.move(2, 100);
  await expect(page.getByRole('navigation', { name: 'Projects' }).getByText('Stopped · 6 services')).toBeVisible();
  await page.getByRole('button', { name: 'Run project', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Project actions' })).toHaveCount(0);
  await expect(page.getByRole('navigation', { name: 'Projects' }).getByText('Running · 6 services')).toBeVisible();
  // The hover sidebar covers the tabs until it finishes closing; clicking sooner re-opens it.
  await expect(page.locator('aside')).toHaveClass(/-translate-x-full/);
  await page.getByRole('tab', { name: 'Terminal' }).click();
  await expect(page.getByText('API listening on http://localhost:3100')).toBeVisible();
  await page.locator('.terminal-panel').getByRole('button', { name: 'Open in Ghostty' }).click();
  await page.screenshot({ path: 'test-results/workspace.png' });
  await page.mouse.move(2, 100);
  await page.getByRole('navigation', { name: 'Projects' }).getByRole('button', { name: /Dealroom/ }).click();
  await page.getByRole('button', { name: 'Run project' }).click();
  await page.getByRole('button', { name: 'Stop project' }).click();
  expect(await page.evaluate(() => (window as any).calls)).toEqual([['start', 'intivo'], ['terminal'], ['start', 'dealroom'], ['stop']]);
});

test('the project header opens the config folder in Finder or the chosen terminal app', async ({ page }) => {
  await page.goto('/');
  const header = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Intivo', exact: true }) });
  await header.getByRole('button', { name: 'Open in Finder' }).click();
  await header.getByRole('button', { name: 'Open in Ghostty' }).click();
  await page.mouse.move(2, 100); await page.getByRole('button', { name: /Settings/ }).click();
  const picker = page.getByRole('group', { name: 'Terminal app' });
  await picker.getByRole('button', { name: 'Terminal', exact: true }).click();
  await expect(picker.getByRole('button', { name: 'Terminal', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByText(/Terminal opens one window per service/)).toBeVisible();
  await page.keyboard.press('Escape');
  await header.getByRole('button', { name: 'Open in Terminal' }).click();
  expect(await page.evaluate(() => (window as any).calls)).toEqual([['finder', 'intivo'], ['config-terminal', 'intivo'], ['config-terminal', 'intivo']]);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('devenv-test-settings')!))).toMatchObject({ terminal: 'terminal' });
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
  await page.keyboard.press('ControlOrMeta+k');
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
  await expect(tutorial.getByRole('heading', { name: 'Which terminal do you use?' })).toBeVisible();
  const terminals = tutorial.getByRole('group', { name: 'Terminal app' });
  await expect(terminals.getByRole('button', { name: 'Terminal' })).toHaveAttribute('aria-pressed', 'true');
  await expect(terminals.getByRole('button', { name: /iTerm2/ })).toContainText('Not found');
  await terminals.getByRole('button', { name: /iTerm2/ }).click();
  await expect(terminals.getByRole('button', { name: /iTerm2/ })).toHaveAttribute('aria-pressed', 'true');
  await expect(terminals.getByRole('button', { name: 'Terminal' })).toHaveAttribute('aria-pressed', 'false');
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
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('devenv-test-settings')!))).toMatchObject({ roots: ['/Users/developer/projects'], appearance: 'light', terminal: 'iterm', onboardingCompleted: true });
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
  for (let i = 0; i < 5; i++) await tutorial.getByRole('button', { name: 'Next' }).click();
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
  for (let i = 0; i < 5; i++) await tutorial.getByRole('button', { name: 'Next' }).click();
  await expect(tutorial.getByText('/Users/developer/code')).toBeVisible();
  await tutorial.getByRole('button', { name: 'Next' }).click();
  await tutorial.getByRole('button', { name: 'Finish' }).click();
  await expect(tutorial).toBeHidden();
});

test('Settings fits the default window without scrolling', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.setItem('devenv-test-settings', JSON.stringify({ roots: ['/Users/developer/code', '/Users/developer/work', '/Users/developer/oss'], exclusions: [], shell: '/bin/zsh', releaseRepo: 'ljellevo/devenv', appearance: 'dark', terminal: 'ghostty', projectFolders: [], projectFolderAssignments: {}, projectTreeOrder: {}, sidebarPinned: false, onboardingCompleted: true })));
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Intivo', exact: true })).toBeVisible();
  await page.mouse.move(2, 100); await page.getByRole('button', { name: /Settings/ }).click();
  const dialog = page.getByRole('dialog');
  for (const tab of ['General', 'Workspace', 'Updates']) {
    await dialog.getByRole('tab', { name: tab }).click();
    if (tab === 'Workspace') await expect(dialog.getByText('/Users/developer/oss')).toBeVisible();
    expect(await dialog.evaluate(el => el.scrollHeight - el.clientHeight), `${tab} tab scrolls`).toBeLessThanOrEqual(0);
  }
});

test('Settings opens on General and saves the shell and workspace fields only when they change', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Intivo', exact: true })).toBeVisible();
  await page.mouse.move(2, 100); await page.getByRole('button', { name: /Settings/ }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('tab', { name: 'General' })).toHaveAttribute('data-state', 'active');
  await expect(dialog.getByRole('group', { name: 'Appearance' })).toBeVisible();
  await expect(dialog.getByRole('group', { name: 'Terminal app' }).getByRole('button')).toHaveCount(3);
  await expect(dialog.getByRole('button', { name: 'Reset tutorial' })).toBeVisible();
  const saveShell = dialog.getByRole('button', { name: 'Save', exact: true });
  await expect(saveShell).toBeDisabled();
  await page.getByLabel('Shell').fill('/bin/bash');
  await expect(saveShell).toBeEnabled();
  await saveShell.click();
  await expect(saveShell).toBeDisabled();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('devenv-test-settings')!))).toMatchObject({ shell: '/bin/bash' });
  await dialog.getByRole('tab', { name: 'Workspace' }).click();
  await expect(page.getByLabel('Shell')).toBeHidden();
  const save = page.getByRole('button', { name: 'Save workspace settings' });
  const exclusions = page.getByLabel('Additional excluded folder names');
  await expect(save).toBeDisabled();
  await exclusions.fill('archive, backups');
  await expect(save).toBeEnabled();
  await exclusions.fill(' , ');
  await expect(save).toBeDisabled();
  await exclusions.fill('archive');
  await save.click();
  await expect(save).toBeDisabled();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('devenv-test-settings')!))).toMatchObject({ exclusions: ['archive'] });
});

test('closing Settings with unsaved edits asks before discarding them', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Intivo', exact: true })).toBeVisible();
  const open = async () => { await page.mouse.move(600, 400); await page.mouse.move(2, 100); await page.getByRole('button', { name: /Settings/ }).click(); await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible(); };
  const confirm = page.getByRole('dialog', { name: 'Discard unsaved settings?' });
  // Without edits, Settings closes straight away.
  await open();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  // Escape with an edit asks first; Keep editing returns to the edit.
  await open();
  await page.getByLabel('Shell').fill('/bin/bash');
  await page.keyboard.press('Escape');
  await expect(confirm).toBeVisible();
  await confirm.getByRole('button', { name: 'Keep editing' }).click();
  await expect(confirm).toBeHidden();
  await expect(page.getByLabel('Shell')).toHaveValue('/bin/bash');
  // The close button and a click outside ask too.
  await page.getByRole('dialog', { name: 'Settings' }).getByRole('button', { name: 'Close dialog' }).first().click();
  await expect(confirm).toBeVisible();
  await confirm.getByRole('button', { name: 'Keep editing' }).click();
  await page.getByRole('dialog', { name: 'Settings' }).getByRole('tab', { name: 'Updates' }).click();
  await page.getByLabel(/Private repository token/).fill('secret');
  await page.mouse.click(5, 5);
  await expect(confirm).toBeVisible();
  await confirm.getByRole('button', { name: 'Discard changes' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await open();
  await expect(page.getByLabel('Shell')).toHaveValue('/bin/zsh');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('devenv-test-settings') ?? '{}'))).not.toMatchObject({ shell: '/bin/bash' });
});

for (const context of [
  { platform: 'macos', extra: '', visible: 'macOS app', hidden: ['Linux app', 'Windows app', 'WSL setup', 'WSL project execution'] },
  { platform: 'linux', extra: '', visible: 'Linux app', hidden: ['macOS app', 'Windows app', 'WSL setup', 'WSL project execution'] },
  { platform: 'windows', extra: '', visible: 'Windows app', hidden: ['macOS app', 'Linux app', 'WSL project execution'] },
  { platform: 'windows', extra: '&wsl', visible: 'WSL project execution', hidden: ['macOS app', 'Linux app', 'PowerShell commands and paths'] },
]) {
  test(`offline Help filters document and navigation: ${context.platform}${context.extra}`, async ({ page }) => {
    await page.goto(`/?platform=${context.platform}${context.extra}`);
    // Host labels follow the desktop platform, not the project's execution target.
    await expect(page.getByRole('button', { name: 'Search projects and commands' })).toContainText(context.platform === 'macos' ? '⌘ K' : 'Ctrl K');
    await expect(page.locator('footer')).toContainText({ macos: 'macOS', linux: 'Linux', windows: 'Windows' }[context.platform]!);
    await expect(page.getByRole('button', { name: `Open in ${{ macos: 'Finder', linux: 'File Manager', windows: 'Explorer' }[context.platform]}` })).toBeVisible();
    await page.getByRole('button', { name: 'Search projects and commands' }).click();
    await page.getByRole('option', { name: 'Help' }).click();
    const help = page.getByRole('dialog', { name: 'Help' });
    await expect(help.getByRole('heading', { name: context.visible, exact: true })).toBeAttached();
    await expect(help.getByRole('navigation', { name: 'Help topics' }).getByRole('link', { name: context.visible, exact: true })).toBeVisible();
    for (const title of context.hidden) { await expect(help.getByRole('heading', { name: title, exact: true })).toHaveCount(0); await expect(help.getByRole('link', { name: title, exact: true })).toHaveCount(0); }
    if (context.platform === 'windows') await expect(help.getByRole('heading', { name: 'WSL setup' })).toBeAttached();
    const invalid = await help.locator('a[href^="#"]').evaluateAll(links => links.filter(link => !document.getElementById(link.getAttribute('href')!.slice(1))).length);
    expect(invalid).toBe(0);
    await page.keyboard.press('Escape');
    await page.mouse.move(2, 100);
    await page.getByRole('button', { name: 'Help', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'Help' }).getByRole('heading', { name: context.visible, exact: true })).toBeAttached();
  });
}

test('only Windows offers per-project execution environments and WSL search folders', async ({ page }) => {
  for (const platform of ['macos', 'linux', 'windows']) {
    await page.goto(`/?platform=${platform}`);
    await expect(page.getByRole('heading', { name: 'Intivo', exact: true })).toBeVisible();
    await expect(page.getByLabel('Execution environment')).toHaveCount(platform === 'windows' ? 1 : 0);
    await page.mouse.move(600, 400); await page.mouse.move(2, 100); await page.getByRole('button', { name: /Settings/ }).click();
    await page.getByRole('dialog', { name: 'Settings' }).getByRole('tab', { name: 'Workspace' }).click();
    await expect(page.getByRole('button', { name: 'Choose WSL folder' })).toHaveCount(platform === 'windows' ? 1 : 0);
    await page.keyboard.press('Escape');
  }
  await expect(page.getByLabel('Execution environment')).toHaveValue('');
});
