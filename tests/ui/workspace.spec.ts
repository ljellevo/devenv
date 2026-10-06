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
    const service = (name: string, port: number) => ({ name, cwd: '/projects/intivo/' + name, command: 'npm run dev', ports: [port], depends_on: [], enabled: true, mode: 'process', env: {}, startup_timeout: 60, stop_timeout: 15, allow_successful_exit: false });
    const projects = [{ id: 'intivo', path: '/Users/developer/code/intivo/resources/devenv.toml', name: 'Intivo', services: [service('postgres', 5433), service('documents', 3200), service('api', 3100), service('web', 5173), service('admin', 5174), service('home', 3000)] }, { id: 'dealroom', path: '/Users/developer/code/dealroom/resources/devenv.toml', name: 'Dealroom', services: [service('api', 3100), service('auth', 3200), service('app', 3000)] }];
    const state: any = { projects, settings: { roots: ['/Users/developer/code'], exclusions: [], shell: '/bin/zsh', releaseRepo: 'ljellevo/devenv', appearance: 'dark' }, session: null, scanning: false, scanErrors: [], update: { status: 'idle', current: '0.1.0' }, hasToken: false };
    let listener = (_: any) => {}, logListener = (_: any) => {};
    (window as any).calls = [];
    window.devenv = {
      state: async () => structuredClone(state), onState: callback => { listener = callback; return () => {}; }, onLog: callback => { logListener = callback; return () => {}; },
      scan: async () => {}, addFolder: async () => {},
      start: async id => { (window as any).calls.push(['start', id]); const project = projects.find(p => p.id === id)!; state.session = { id: 'session-' + id, project, status: 'running', startedAt: new Date().toISOString(), services: project.services.map(s => ({ name: s.name, status: 'ready', pid: 123 })) }; listener(structuredClone(state)); setTimeout(() => logListener({ seq: 1, time: new Date().toISOString(), service: 'api', stream: 'stdout', text: 'API listening on http://localhost:3100\n' }), 100); },
      stop: async () => { (window as any).calls.push(['stop']); state.session.status = 'stopped'; state.session.services.forEach((s: any) => s.status = 'stopped'); listener(structuredClone(state)); },
      startService: async (id, name) => { (window as any).calls.push(['start-service', id, name]); }, stopService: async (id, name) => { (window as any).calls.push(['stop-service', id, name]); },
      logs: async () => [], restart: async () => {}, openTerminal: async () => { (window as any).calls.push(['terminal']); },
      openConfigFinder: async id => { (window as any).calls.push(['finder', id]); }, openConfigTerminal: async id => { (window as any).calls.push(['config-terminal', id]); },
      readConfig: async id => ({ path: projects.find(p => p.id === id)!.path, text: 'version = 1\nname = "Intivo"\n\n[services.api]\ncwd = "."\ncommand = "npm run dev"\n', revision: '0'.repeat(64) }),
      validateConfig: async () => ({ valid: true }), saveConfig: async (id, text) => ({ path: projects.find(p => p.id === id)!.path, text, revision: '1'.repeat(64) }),
      saveSettings: async settings => { state.settings = settings; listener(structuredClone(state)); }, saveToken: async token => { state.hasToken = !!token; listener(structuredClone(state)); },
      checkUpdate: async () => { state.update = { current: '0.1.0', status: 'available', latest: 'v0.2.0', notes: 'Better session cleanup.' }; listener(structuredClone(state)); }, installUpdate: async () => { (window as any).calls.push(['update']); },
    };
  });
});

test('start, view logs, open Ghostty, switch, and stop through the shared API', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Intivo', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Start session', exact: true }).click();
  await page.getByRole('tab', { name: 'Terminal' }).click();
  await expect(page.getByText('API listening on http://localhost:3100')).toBeVisible();
  await page.getByRole('button', { name: 'Open in Ghostty' }).click();
  await page.screenshot({ path: 'test-results/workspace.png' });
  await page.getByRole('navigation', { name: 'Projects' }).getByRole('button', { name: /Dealroom/ }).click();
  await page.getByRole('button', { name: 'Switch here' }).click();
  await page.getByRole('button', { name: 'Stop session' }).click();
  expect(await page.evaluate(() => (window as any).calls)).toEqual([['start', 'intivo'], ['terminal'], ['start', 'dealroom'], ['stop']]);
});

test('settings expose release checks and require an explicit install action', async ({ page }) => {
  await page.goto('/'); await page.getByRole('button', { name: /Settings/ }).click();
  await page.getByRole('tab', { name: /Updates/ }).click();
  await page.getByRole('button', { name: 'Check for updates' }).click();
  await expect(page.getByText('Version v0.2.0 is available')).toBeVisible();
  await page.getByRole('button', { name: 'Download & install' }).click();
  await expect(page.getByRole('heading', { name: 'Install the update' })).toBeVisible();
  expect(await page.evaluate(() => (window as any).calls)).toEqual([]);
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  expect(await page.evaluate(() => (window as any).calls)).toEqual([]);
});
