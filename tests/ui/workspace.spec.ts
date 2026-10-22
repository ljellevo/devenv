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
    if (new URLSearchParams(location.search).has('installing')) { const cwd = '/Users/developer/code/dealroom/resources'; projects[1].install = { cwd, steps: [{ id: 'dependencies', command: 'npm install', cwd, env: {}, timeout: 1800, interactive: false }, { id: 'database', command: 'npm run db:setup', cwd, env: {}, timeout: 600, interactive: true, notes: 'Creates the local Postgres database.' }, { id: 'seed', command: 'npm run db:seed', cwd, env: {}, timeout: 600, interactive: false }], recipeHash: 'test' }; projects[1].installed = false; }
    const defaultSettings = { roots: ['/Users/developer/code'], exclusions: [], shell: '/bin/zsh', releaseRepo: 'ljellevo/devenv', appearance: 'dark', terminal: 'ghostty', projectFolders: [], projectFolderAssignments: {}, projectTreeOrder: {}, sidebarPinned: false, onboardingCompleted: true };
    if (new URLSearchParams(location.search).has('onboarding')) Object.assign(defaultSettings, { roots: [], appearance: 'system', terminal: 'terminal', onboardingCompleted: false });
    const state: any = { hostPlatform: new URLSearchParams(location.search).get('platform') || 'macos', projects, settings: JSON.parse(localStorage.getItem('devenv-test-settings') || JSON.stringify(defaultSettings)), session: null, scanning: false, scanErrors: [], update: { status: 'idle', current: '0.1.0' }, installedTerminals: ['terminal', 'ghostty'], harnesses: {} };
    if (new URLSearchParams(location.search).has('installing')) Object.assign(state, { installOutput: '', installState: { projectId: 'dealroom', status: 'running', stepId: 'database', stepIndex: 1, completedStepIds: ['dependencies'] } });
    let listener = (_: any) => {}, logListener = (_: any) => {}, harnessListener = (_: any) => {}, harnessExitListener = (_: any) => {};
    const harnessRuns: Record<string, { run: number; command: string; running: boolean }> = {};
    (window as any).calls = [];
    if (new URLSearchParams(location.search).has('wsl')) projects.forEach(project => project.executionTarget = { kind: 'wsl', distribution: 'Ubuntu-24.04' });
    const harnessState = (id: string, value: string) => { state.harnesses = { ...state.harnesses, [id]: { run: harnessRuns[id].run, command: harnessRuns[id].command, state: value } }; listener(structuredClone(state)); };
    window.devenv = {
      setProjectTarget: async id => id, wslDistributions: async () => [], wslDirectories: async () => ({ path: '/', directories: [] }), addWslFolder: async () => {},
      state: async () => structuredClone(state), onState: callback => { listener = callback; return () => {}; }, onLog: callback => { logListener = callback; return () => {}; }, onInstallOutput: () => () => {},
      scan: async () => {}, addFolder: async () => { state.settings = { ...state.settings, roots: [...state.settings.roots, '/Users/developer/projects'] }; listener(structuredClone(state)); }, createProject: async agentGuide => { if (agentGuide) (window as any).calls.push(['create', agentGuide]); const created = { id: 'new-project', path: '/Users/developer/code/New Project/devenv.toml', name: 'New Project', services: [], draft: true }; projects.push(created); state.projects = projects; listener(structuredClone(state)); return { id: created.id, path: created.path }; },
      start: async id => { (window as any).calls.push(['start', id]); const project = projects.find(p => p.id === id)!; state.session = { id: 'session-' + id, project, status: 'running', startedAt: new Date().toISOString(), services: project.services.map((s: any) => ({ name: s.name, status: 'ready', pid: 123 })) }; listener(structuredClone(state)); setTimeout(() => logListener({ seq: 1, time: new Date().toISOString(), service: 'api', stream: 'stdout', text: 'API listening on http://localhost:3100\n' }), 100); },
      install: async (id, mode) => { (window as any).calls.push(['install', id, mode]); }, cancelInstall: async () => {}, installInput: async () => {}, installResize: async () => {},
      stop: async () => { (window as any).calls.push(['stop']); state.session.status = 'stopped'; state.session.services.forEach((s: any) => s.status = 'stopped'); listener(structuredClone(state)); },
      startService: async (id, name) => { (window as any).calls.push(['start-service', id, name]); }, stopService: async (id, name) => { (window as any).calls.push(['stop-service', id, name]); },
      logs: async () => [], restart: async () => {}, openTerminal: async () => { (window as any).calls.push(['terminal']); },
      openConfigFinder: async id => { (window as any).calls.push(['finder', id]); }, openConfigTerminal: async id => { (window as any).calls.push(['config-terminal', id]); },
      harnessOpen: async (id, cols, rows, restart) => {
        const choice = state.settings.projectHarnesses?.[id.replace(/:\d+$/, '')] ?? state.settings;
        const command = choice.harness === 'custom' ? choice.harnessCommand : choice.harness === 'codex' ? 'codex' : 'claude';
        if (!harnessRuns[id]?.running || restart) { harnessRuns[id] = { run: (harnessRuns[id]?.run ?? 0) + 1, command, running: true }; (window as any).calls.push(['harness', id, command]); harnessState(id, 'idle'); }
        const output = `${harnessRuns[id].command} ready in ${id}\r\n`;
        return { ...harnessRuns[id], output, offset: output.length };
      },
      // Enter makes the fake harness work for a moment before it goes idle again.
      harnessInput: async (id, data) => { const { run } = harnessRuns[id]; harnessListener({ id, run, data: `echo:${data}`, offset: 1000 }); if (data === '\r') { harnessState(id, 'working'); setTimeout(() => { if (harnessRuns[id].run === run && harnessRuns[id].running) harnessState(id, 'idle'); }, 1200); } }, harnessResize: async () => {},
      harnessClose: async (id, forget) => { const { run } = harnessRuns[id]; harnessRuns[id].running = false; harnessExitListener({ id, run, exitCode: 0 }); harnessState(id, 'exited'); if (forget) { delete state.harnesses[id]; listener(structuredClone(state)); } },
      onHarnessOutput: callback => { harnessListener = callback; return () => {}; }, onHarnessExit: callback => { harnessExitListener = callback; return () => {}; },
      readConfig: async id => ({ path: projects.find(p => p.id === id)!.path, text: 'version = 1\nname = "Intivo"\n\n[services.api]\ncwd = "."\ncommand = "npm run dev"\n', revision: '0'.repeat(64) }),
      validateConfig: async () => ({ valid: true }), saveConfig: async (id, text) => ({ path: projects.find(p => p.id === id)!.path, text, revision: '1'.repeat(64) }),
      saveSettings: async settings => { state.settings = settings; localStorage.setItem('devenv-test-settings', JSON.stringify(settings)); listener(structuredClone(state)); },
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
  await expect(page.getByRole('tab', { name: 'Install' })).toHaveAttribute('aria-selected', 'true');
});

test('Run project switches to the Services tab', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('tab', { name: 'Logs' }).click();
  await page.getByRole('button', { name: 'Run project' }).click();
  await expect(page.getByRole('tab', { name: 'Services' })).toHaveAttribute('aria-selected', 'true');
  expect((await page.evaluate(() => (window as any).calls))[0][0]).toBe('start');
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
  await expect(page.locator('aside').first()).toHaveClass(/-translate-x-full/);
  await page.getByRole('tab', { name: 'Logs' }).click();
  await expect(page.getByText('API listening on http://localhost:3100')).toBeVisible();
  // Each service has a tab where the service dropdown used to be.
  const filters = page.getByRole('tablist', { name: 'Filter logs by service' });
  await expect(filters.getByRole('tab')).toHaveText(['All', 'postgres', 'documents', 'api', 'web', 'admin', 'home']);
  await expect(filters.getByRole('tab', { name: 'All' })).toHaveAttribute('aria-selected', 'true');
  await filters.getByRole('tab', { name: 'web' }).click();
  await expect(page.getByText('API listening on http://localhost:3100')).toBeHidden();
  await filters.getByRole('tab', { name: 'api' }).click();
  await expect(page.getByText('API listening on http://localhost:3100')).toBeVisible();
  await page.locator('.terminal-panel').getByRole('button', { name: 'Open in Ghostty' }).click();
  await page.screenshot({ path: 'test-results/workspace.png' });
  await page.mouse.move(2, 100);
  await page.getByRole('navigation', { name: 'Projects' }).getByRole('button', { name: /Dealroom/ }).click();
  await page.getByRole('button', { name: 'Run project' }).click();
  await page.getByRole('button', { name: 'Stop project' }).click();
  expect(await page.evaluate(() => (window as any).calls)).toEqual([['start', 'intivo'], ['terminal'], ['start', 'dealroom'], ['stop']]);
});

test('the agent terminal slides in as a sheet, keeps running when minimized, and shows working or idle', async ({ page }) => {
  await page.goto('/');
  const terminal = page.getByLabel('Coding agent terminal');
  const sheet = page.getByRole('complementary', { name: 'Claude Code terminal' });
  const pill = page.getByRole('button', { name: /^Claude Code/ });
  const calls = () => page.evaluate(() => (window as any).calls);
  // It is no longer a tab, and nothing launches until the sheet is opened.
  await expect(page.getByRole('tablist').first().getByRole('tab')).toHaveText(['Services', 'Logs', 'Config']);
  await expect(pill).toHaveText('Claude Code');
  await expect(terminal).toBeHidden();
  expect(await calls()).toEqual([]);
  await pill.click();
  await expect(sheet).toBeInViewport();
  await expect(pill).toBeHidden();
  await expect(terminal).toContainText('claude ready in intivo');
  await expect(sheet.getByText('Idle')).toBeVisible();
  await expect(sheet.getByRole('button', { name: 'Restart', exact: true })).toBeEnabled();
  // A click beside the sheet minimizes it and still reaches what was clicked.
  await page.getByRole('tab', { name: 'Logs' }).click();
  await expect(page.getByRole('tab', { name: 'Logs' })).toHaveAttribute('aria-selected', 'true');
  await expect(sheet).not.toBeInViewport();
  await pill.click();
  await expect(sheet).toBeInViewport();
  await terminal.click();
  await page.keyboard.type('hi');
  await expect(terminal).toContainText('echo:hecho:i');
  await page.keyboard.press('Enter');
  await expect(sheet.getByText('Working')).toBeVisible();
  // Minimizing hides the sheet but not the session; the pill keeps showing its activity.
  await sheet.getByRole('button', { name: 'Minimize' }).click();
  await expect(sheet).not.toBeInViewport();
  await expect(pill).toHaveText('Claude CodeWorking');
  await expect(pill).toHaveText('Claude CodeIdle');
  await pill.click();
  await expect(sheet).toBeInViewport();
  await expect(terminal).toContainText('echo:hecho:i');
  expect(await calls()).toEqual([['harness', 'intivo', 'claude']]);
});

test('Space on the selected project opens the agent terminal', async ({ page }) => {
  await page.goto('/');
  const terminal = page.getByLabel('Coding agent terminal');
  const sheet = page.locator('aside').filter({ has: terminal });
  await expect(page.getByRole('heading', { name: 'Intivo', exact: true })).toBeVisible();
  // Text fields and other controls keep the key.
  await page.getByRole('tab', { name: 'Logs' }).click();
  await page.getByLabel('Search logs').fill('a b');
  await page.getByRole('tab', { name: 'Logs' }).press('Space');
  await expect(page.getByLabel('Search logs')).toHaveValue('a b');
  await expect(sheet).not.toBeInViewport();
  // Space on another project selects it, as before; on the selected project it opens the sheet.
  await page.mouse.move(2, 100);
  await page.getByRole('navigation', { name: 'Projects' }).getByRole('button', { name: /Dealroom/ }).press('Space');
  await expect(page.getByRole('heading', { name: 'Dealroom', exact: true })).toBeVisible();
  await expect(sheet).not.toBeInViewport();
  await page.getByRole('navigation', { name: 'Projects' }).getByRole('button', { name: /Dealroom/ }).press('Space');
  await expect(sheet).toBeInViewport();
  await expect(terminal).toContainText('claude ready in dealroom');
  // In the terminal, Space is typed like any other key.
  await terminal.click();
  await page.keyboard.press('Space');
  await expect(terminal).toContainText('echo: ');
  // Shift+Enter reaches the agent as a new line instead of sending the message, and ⌘ edits the line.
  await page.evaluate(() => { const { harnessInput } = window.devenv; (window as any).typed = []; window.devenv.harnessInput = (id, data) => { (window as any).typed.push(data); return harnessInput(id, data); }; });
  for (const key of ['Shift+Enter', 'Meta+Backspace', 'Meta+ArrowLeft', 'Meta+ArrowRight', 'Backspace']) await page.keyboard.press(key);
  await expect.poll(() => page.evaluate(() => (window as any).typed)).toEqual(['\x1b\r', '\x15', '\x01', '\x05', '\x7f']);
  await expect(sheet.getByText('Idle')).toBeVisible();
  await sheet.getByRole('button', { name: 'Minimize' }).click();
  await expect(sheet).not.toBeInViewport();
  await page.mouse.move(700, 600);
  await page.locator('body').press('Space');
  await expect(sheet).toBeInViewport();
  expect(await page.evaluate(() => (window as any).calls)).toEqual([['harness', 'dealroom', 'claude']]);
});

test('a project can override the harness from Settings', async ({ page }) => {
  await page.goto('/');
  const terminal = page.getByLabel('Coding agent terminal');
  const sheet = page.locator('aside').filter({ has: page.getByLabel('Coding agent terminal') });
  await page.getByRole('button', { name: /^Claude Code/ }).click();
  await expect(terminal).toContainText('claude ready in intivo');
  // A project override leaves the running harness alone until it is restarted.
  await sheet.getByLabel('Harness for this project').selectOption('codex');
  await expect(sheet.getByRole('heading', { name: 'claude', exact: true })).toBeVisible();
  await sheet.getByRole('button', { name: 'Restart with Codex' }).click();
  await expect(terminal).toContainText('codex ready in intivo');
  await expect(sheet.getByRole('heading', { name: 'Codex' })).toBeVisible();
  await sheet.getByRole('button', { name: 'Stop', exact: true }).click();
  await expect(sheet.getByText('Exited', { exact: true })).toBeVisible();
  await expect(terminal).toContainText('[devenv] codex exited.');
  // Custom asks for the command, which then joins the menu.
  const menu = sheet.getByLabel('Harness for this project');
  await expect(menu.getByRole('option')).toHaveText(['Default · Claude Code', 'Claude Code', 'Codex', 'Custom command…']);
  await menu.selectOption('Custom command…');
  const prompt = page.getByRole('dialog', { name: 'Custom harness' });
  await expect(prompt.getByRole('button', { name: 'Use command' })).toBeDisabled();
  await prompt.getByRole('button', { name: 'Cancel' }).click();
  await expect(menu).toHaveValue('codex');
  await menu.selectOption('Custom command…');
  await prompt.getByRole('textbox', { name: 'Harness command' }).fill(' aider --model sonnet ');
  await prompt.getByRole('textbox', { name: 'Harness command' }).press('Enter');
  await expect(prompt).toBeHidden();
  await expect(menu.getByRole('option')).toHaveText(['Default · Claude Code', 'Claude Code', 'Codex', 'aider --model sonnet', 'Custom command…']);
  await expect(menu).toHaveValue('custom:aider --model sonnet');
  await sheet.getByRole('button', { name: 'Restart with aider' }).click();
  await expect(terminal).toContainText('aider --model sonnet ready in intivo');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('devenv-test-settings')!))).toMatchObject({ projectHarnesses: { intivo: { harness: 'custom', harnessCommand: 'aider --model sonnet' } } });
  // Choosing another project minimizes the sheet instead of launching that project's harness.
  await sheet.getByRole('button', { name: 'Minimize' }).click();
  await page.mouse.move(2, 100);
  await page.getByRole('navigation', { name: 'Projects' }).getByRole('button', { name: /Dealroom/ }).click();
  await expect(page.locator('aside').first()).toHaveClass(/-translate-x-full/);
  await expect(sheet).not.toBeInViewport();
  await page.getByRole('button', { name: /^Claude Code/ }).click();
  await expect(menu).toHaveValue('default');
  await expect(terminal).toContainText('claude ready in dealroom');
  expect(await page.evaluate(() => (window as any).calls)).toEqual([['harness', 'intivo', 'claude'], ['harness', 'intivo', 'codex'], ['harness', 'intivo', 'aider --model sonnet'], ['harness', 'dealroom', 'claude']]);
  // Another project can pick the custom harness; once no project uses it, it leaves the menu. Claude Code and Codex stay.
  await menu.selectOption('aider --model sonnet');
  await expect(sheet.getByRole('button', { name: 'Restart with aider' })).toBeVisible();
  await menu.selectOption('Codex');
  await expect(menu.getByRole('option')).toHaveText(['Default · Claude Code', 'Claude Code', 'Codex', 'aider --model sonnet', 'Custom command…']);
  await sheet.getByRole('button', { name: 'Minimize' }).click();
  await page.mouse.move(2, 100);
  await page.getByRole('navigation', { name: 'Projects' }).getByRole('button', { name: /Intivo/ }).click();
  await expect(page.locator('aside').first()).toHaveClass(/-translate-x-full/);
  await page.getByRole('button', { name: /^aider/ }).click();
  await menu.selectOption('Default · Claude Code');
  await expect(menu.getByRole('option')).toHaveText(['Default · Claude Code', 'Claude Code', 'Codex', 'Custom command…']);
});

test('the agent sheet opens more tabs from + or ⌘T, and each tab runs its own harness', async ({ page }) => {
  await page.goto('/');
  const sheet = page.getByRole('complementary', { name: 'Claude Code terminal' });
  const tabs = sheet.getByRole('tablist', { name: 'Agent tabs' }).getByRole('tab');
  const terminal = page.getByLabel('Coding agent terminal');
  const pill = page.getByRole('button', { name: /^Claude Code/ });
  const calls = () => page.evaluate(() => (window as any).calls);
  await pill.click();
  await expect(terminal).toContainText('claude ready in intivo');
  await expect(tabs).toHaveText(['Claude Code']);
  // A new tab starts its harness right away and is selected.
  await sheet.getByRole('button', { name: 'New tab' }).click();
  await expect(tabs).toHaveText(['Claude Code 1', 'Claude Code 2']);
  await expect(tabs.nth(1)).toHaveAttribute('aria-selected', 'true');
  await expect(terminal).toContainText('claude ready in intivo:2');
  // ⌘T works while the terminal has focus.
  await terminal.click();
  await page.keyboard.press('Meta+t');
  await expect(tabs).toHaveCount(3);
  await expect(terminal).toContainText('claude ready in intivo:3');
  expect(await calls()).toEqual([['harness', 'intivo', 'claude'], ['harness', 'intivo:2', 'claude'], ['harness', 'intivo:3', 'claude']]);
  // Each tab keeps its own terminal, and a working tab shows it on the tab and the pill.
  await tabs.first().click();
  await expect(terminal).not.toContainText('intivo:');
  await terminal.click();
  await page.keyboard.press('Enter');
  await expect(tabs.first().getByLabel('Working')).toBeVisible();
  await sheet.getByRole('button', { name: 'Minimize' }).click();
  await expect(pill).toHaveText('Claude CodeWorking');
  await expect(pill).toHaveText('Claude CodeIdle');
  // ⌘T on a minimized sheet opens it with a new tab.
  await page.locator('body').press('Meta+t');
  await expect(sheet).toBeInViewport();
  await expect(tabs).toHaveCount(4);
  await expect(terminal).toContainText('claude ready in intivo:4');
  // Closing a tab stops its harness; the others keep running.
  await sheet.getByRole('button', { name: 'Close Claude Code 4' }).click();
  // Closing the selected tab selects the one before it.
  await expect(tabs.nth(2)).toHaveAttribute('aria-selected', 'true');
  await sheet.getByRole('button', { name: 'Close Claude Code 2' }).click();
  await expect(tabs).toHaveText(['Claude Code 1', 'Claude Code 2']);
  await expect(tabs.nth(1)).toHaveAttribute('aria-selected', 'true');
  await expect(terminal).toContainText('claude ready in intivo:3');
  await sheet.getByRole('button', { name: 'Close Claude Code 2' }).click();
  // Closing the last tab minimizes the sheet, and opening it again starts a fresh harness.
  await sheet.getByRole('button', { name: 'Close Claude Code' }).click();
  await expect(sheet).not.toBeInViewport();
  await expect(pill).toHaveText('Claude Code');
  await pill.click();
  await expect(tabs).toHaveText(['Claude Code']);
  await expect(terminal).toContainText('claude ready in intivo');
  expect((await calls()).length).toBe(5);
});

test('choosing another project while the agent sheet is open switches to its agents, and tabs can be renamed and colored', async ({ page }) => {
  await page.goto('/');
  const sheet = page.getByRole('complementary', { name: 'Claude Code terminal' });
  const tabs = sheet.getByRole('tablist', { name: 'Agent tabs' }).getByRole('tab');
  const terminal = page.getByLabel('Coding agent terminal');
  const projects = page.getByRole('navigation', { name: 'Projects' });
  await page.getByRole('button', { name: /^Claude Code/ }).click();
  await expect(terminal).toContainText('claude ready in intivo');
  // Right-click a tab to color it; double-click to rename it. Escape keeps the name it had.
  await tabs.first().click({ button: 'right' });
  const menu = page.getByRole('menu', { name: 'Tab options' });
  await menu.getByRole('menuitemradio', { name: 'Blue' }).click();
  await expect(menu).toBeHidden();
  await expect(tabs.first().getByTestId('tab-color')).toHaveCSS('background-color', 'rgb(59, 130, 246)');
  await tabs.first().dblclick();
  const name = sheet.getByRole('textbox', { name: 'Tab name' });
  await name.fill('Refactor auth');
  await name.press('Enter');
  await expect(tabs).toHaveText(['Refactor auth']);
  await tabs.first().click({ button: 'right' });
  await menu.getByRole('menuitem', { name: 'Rename' }).click();
  await name.fill('Something else');
  await name.press('Escape');
  await expect(tabs).toHaveText(['Refactor auth']);
  // The sheet stays open on the chosen project and starts its agent there.
  await page.mouse.move(2, 100);
  await projects.getByRole('button', { name: /Dealroom/ }).click();
  await expect(page.getByRole('heading', { name: 'Dealroom', exact: true })).toBeVisible();
  await expect(sheet).toBeInViewport();
  await expect(sheet).toContainText('Dealroom');
  await expect(terminal).toContainText('claude ready in dealroom');
  await expect(tabs).toHaveText(['Claude Code']);
  // Going back attaches to the running agent and keeps the tab's name and color.
  await page.mouse.move(700, 400);
  await page.mouse.move(2, 100);
  await projects.getByRole('button', { name: /Intivo/ }).click();
  await expect(sheet).toBeInViewport();
  await expect(terminal).toContainText('claude ready in intivo');
  await expect(tabs).toHaveText(['Refactor auth']);
  await expect(tabs.first().getByTestId('tab-color')).toBeVisible();
  expect(await page.evaluate(() => (window as any).calls)).toEqual([['harness', 'intivo', 'claude'], ['harness', 'dealroom', 'claude']]);
});

test('Settings chooses the default harness', async ({ page }) => {
  await page.goto('/');
  await page.mouse.move(2, 100); await page.getByRole('button', { name: /Settings/ }).click();
  const picker = page.getByRole('group', { name: 'Coding agent' });
  await expect(picker.getByRole('button', { name: 'Claude Code' })).toHaveAttribute('aria-pressed', 'true');
  await picker.getByRole('button', { name: 'Codex' }).click();
  await expect(picker.getByRole('button', { name: 'Codex' })).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('Escape');
  await expect(page.locator('aside').first()).toHaveClass(/-translate-x-full/);
  await page.getByRole('button', { name: /^Codex/ }).click();
  await expect(page.getByLabel('Coding agent terminal')).toContainText('codex ready in intivo');
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

test('Install tab lists steps with progress and can switch to the terminal', async ({ page }) => {
  await page.goto('/?installing');
  await page.mouse.move(2, 100);
  await page.getByRole('navigation', { name: 'Projects' }).getByRole('button', { name: /Dealroom/ }).click();
  await page.getByRole('tab', { name: 'Install' }).click();
  const steps = page.getByRole('list', { name: 'Installation steps' });
  await expect(steps.getByRole('listitem')).toHaveCount(3);
  await expect(steps.getByRole('listitem').nth(0).getByLabel('Done')).toBeVisible();
  await expect(steps.getByRole('listitem').nth(1).getByLabel('Running')).toBeVisible();
  await expect(steps.getByRole('listitem').nth(2).getByLabel('Pending')).toBeVisible();
  await expect(page.getByText('Creates the local Postgres database.')).toBeVisible();
  await expect(page.getByLabel('Interactive installation terminal')).toBeHidden();
  await page.getByRole('button', { name: 'Show terminal' }).click();
  await expect(page.getByLabel('Interactive installation terminal')).toBeVisible();
  await expect(steps).toBeHidden();
  await page.getByRole('button', { name: 'Show steps' }).click();
  await expect(steps).toBeVisible();
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

test('Create project in the command menu makes a new project with an agent guide and no setup prompt', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Project actions' }).click();
  await expect(page.getByRole('menuitem')).toHaveText(['Reinstall project']);
  await page.keyboard.press('Escape');
  await page.keyboard.press('ControlOrMeta+k');
  await page.getByRole('option', { name: 'Create project' }).click();
  await expect(page.getByRole('heading', { name: 'New Project', exact: true })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Config' })).toHaveAttribute('data-state', 'active');
  await expect(page.getByRole('menu')).toHaveCount(0);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(await page.evaluate(() => (window as any).calls)).toEqual([['create', true]]);
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
  await expect(tutorial.getByRole('heading', { name: 'Which coding agent do you use?' })).toBeVisible();
  const agents = tutorial.getByRole('group', { name: 'Coding agent' });
  await expect(agents.getByRole('button', { name: 'Claude Code' })).toHaveAttribute('aria-pressed', 'true');
  await agents.getByRole('button', { name: 'Custom' }).click();
  await tutorial.getByRole('textbox', { name: 'Custom harness command' }).fill('gemini --yolo');
  await tutorial.getByRole('button', { name: 'Save' }).click();
  await expect(tutorial.getByRole('button', { name: 'Save' })).toBeDisabled();
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
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('devenv-test-settings')!))).toMatchObject({ roots: ['/Users/developer/projects'], appearance: 'light', terminal: 'iterm', harness: 'custom', harnessCommand: 'gemini --yolo', onboardingCompleted: true });
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
  for (let i = 0; i < 6; i++) await tutorial.getByRole('button', { name: 'Next' }).click();
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
  for (let i = 0; i < 6; i++) await tutorial.getByRole('button', { name: 'Next' }).click();
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
  await page.getByLabel('GitHub release repository').fill('someone/else');
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
