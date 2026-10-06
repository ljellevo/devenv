import { app, BrowserWindow, Menu, Tray, nativeImage, nativeTheme, ipcMain, dialog, shell } from 'electron';
import { fork, type ChildProcess } from 'node:child_process';
import { mkdir, readFile, writeFile, rename, stat } from 'node:fs/promises';
import { watch, type FSWatcher } from 'node:fs';
import { join, resolve, isAbsolute, dirname } from 'node:path';
import { homedir } from 'node:os';
import { z } from 'zod';
import { discover, validateProjectText } from '../core/config';
import { readConfigDocument, saveConfigDocument } from '../core/config-files';
import { themeFromZshrc } from '../core/theme';
import { message } from '../core/process';
import { Updater } from '../core/updater';
import { openGhostty, openGhosttyDirectory } from './ghostty';
import trayIcon from './trayTemplate.png';
import trayIcon2x from './trayTemplate@2x.png';
import type { AppState, ConfigValidation, Settings, Session } from '../shared/types';

app.setName('Devenv');
if (process.env.DEVENV_DATA_DIR && !app.isPackaged) app.setPath('userData', resolve(process.env.DEVENV_DATA_DIR));
const single = app.requestSingleInstanceLock();
if (!single) app.quit();
let window: BrowserWindow | undefined;
let tray: Tray;
let worker: ChildProcess;
let updater: Updater;
let ready = false, quitting = false, quitRequested = false;
let sequence = 0;
const requests = new Map<number, { resolve(value: any): void; reject(error: Error): void }>();
const defaults: Settings = { roots: [], exclusions: [], shell: process.env.SHELL || '/bin/zsh', releaseRepo: 'ljellevo/devenv', appearance: 'dark' };
const state: AppState = { projects: [], settings: defaults, session: null, scanning: false, scanErrors: [], update: { status: 'idle', current: app.getVersion() }, hasToken: false, theme: themeFromZshrc('') };
let watchers: FSWatcher[] = [];
let scanTimer: ReturnType<typeof setTimeout>;
let updateStartTimer: ReturnType<typeof setTimeout> | undefined;
let updatePollTimer: ReturnType<typeof setInterval> | undefined;
let rescan = false;
const UPDATE_CHECK_INTERVAL_MS = 3 * 60 * 60 * 1000;

function publish() {
  if (window && !window.isDestroyed()) window.webContents.send('devenv:state', state);
  if (tray) updateTray();
}
function report(error: unknown) { state.error = message(error); publish(); }
function action(fn: () => Promise<unknown>) { void fn().catch(report); }
function rpc<T = void>(method: string, value?: string): Promise<T> {
  return new Promise((resolve, reject) => {
    if (!ready || !worker?.connected) return reject(new Error(state.error || 'Session supervisor is not ready yet.'));
    const id = ++sequence; requests.set(id, { resolve, reject }); worker.send({ id, method, value });
  });
}
function createWindow() {
  window = new BrowserWindow({ width: 1200, height: 820, minWidth: 900, minHeight: 620, title: 'Devenv', titleBarStyle: 'hiddenInset', transparent: true, vibrancy: 'menu', visualEffectState: 'active', backgroundColor: '#00000000', webPreferences: { preload: join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true } });
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', event => event.preventDefault());
  const url = !app.isPackaged && process.env.DEVENV_RENDERER_URL;
  if (url) void window.loadURL(url); else void window.loadFile(join(__dirname, 'renderer/index.html'));
  window.on('close', event => { if (!quitting) { event.preventDefault(); window?.hide(); } });
  window.on('focus', () => { void refreshTheme(); clearTimeout(scanTimer); scanTimer = setTimeout(() => action(scan), 300); });
}
async function refreshTheme() {
  state.theme = themeFromZshrc(await readFile(join(homedir(), '.zshrc'), 'utf8').catch(() => ''));
  publish();
}
function show() { if (!window || window.isDestroyed()) createWindow(); window!.show(); window!.focus(); }
function updateTray() {
  const session = state.session;
  const active = session && !['stopped', 'failed'].includes(session.status);
  tray.setToolTip(active ? `Devenv · ${session.project.name} · ${session.status}` : 'Devenv · No active project');
  tray.setTitle(active ? session.project.name : '');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: active ? `${session.project.name} · ${session.status}` : 'No active project', enabled: false },
    { type: 'separator' },
    ...state.projects.map(project => ({ label: project.name, type: 'checkbox' as const, checked: !!active && session.project.id === project.id, enabled: !project.error && ready && !['starting', 'stopping'].includes(session?.status ?? ''), click: () => action(() => startProject(project.id)) })),
    { type: 'separator' },
    { label: 'Stop session', enabled: !!active, click: () => action(() => rpc('stop')) },
    { label: 'Open in Ghostty', enabled: !!active, click: () => action(terminal) },
    { label: 'Show Devenv', click: show },
    { label: 'Check for updates', click: () => { show(); action(() => updater.check(state.settings.releaseRepo)); } },
    { type: 'separator' }, { label: 'Quit Devenv', accelerator: 'Command+Q', click: () => app.quit() },
  ]));
}
function trayImage() {
  // Two opposing arrows (build/tray.svg), rendered as a native macOS template image.
  const image = nativeImage.createEmpty();
  image.addRepresentation({ scaleFactor: 1, dataURL: trayIcon });
  image.addRepresentation({ scaleFactor: 2, dataURL: trayIcon2x });
  image.setTemplateImage(true); return image;
}
async function saveSettings(settings: Settings) {
  const previous = state.settings;
  const next = z.object({ roots: z.array(z.string().min(1)).max(30), exclusions: z.array(z.string().min(1)).max(100), shell: z.string().min(1), releaseRepo: z.string().regex(/^[\w.-]+\/[\w.-]+$/), appearance: z.enum(['light', 'dark']) }).strict().parse(settings);
  if (!isAbsolute(next.shell) || !(await stat(next.shell)).isFile()) throw new Error('Shell must be an absolute path to an executable file.');
  if (next.roots.some(root => !isAbsolute(root))) throw new Error('Search folders must use absolute paths.');
  if (next.shell !== previous.shell) {
    if (state.session && !['stopped', 'failed'].includes(state.session.status)) throw new Error('Stop the session before changing shells.');
    await rpc('shell', next.shell);
  }
  const root = app.getPath('userData');
  await writeFile(join(root, 'settings.tmp'), JSON.stringify(next, null, 2), { mode: 0o600 });
  await rename(join(root, 'settings.tmp'), join(root, 'settings.json'));
  state.settings = next;
  nativeTheme.themeSource = next.appearance;
  publish();
  if (next.roots.join('\0') !== previous.roots.join('\0') || next.exclusions.join('\0') !== previous.exclusions.join('\0')) await scan();
}
async function scan() {
  if (state.scanning) { rescan = true; return; }
  state.scanning = true; publish();
  try {
    const result = await discover(state.settings.roots, state.settings.exclusions);
    state.projects = result.projects; state.scanErrors = result.errors;
    watchers.forEach(w => w.close()); watchers = [];
    // Shallow watches avoid attaching watchers to dependency trees. Focus/Refresh discovers new nested configs.
    for (const path of new Set([...state.settings.roots, ...state.projects.map(p => dirname(p.path))])) {
      try { watchers.push(watch(path, () => { clearTimeout(scanTimer); scanTimer = setTimeout(() => action(scan), 600); })); } catch { /* scan errors already exposed */ }
    }
  } finally {
    state.scanning = false; publish();
    if (rescan) { rescan = false; void scan(); }
  }
}
async function startProject(id: string) {
  if (quitRequested) throw new Error('Devenv is shutting down.');
  const project = state.projects.find(p => p.id === id);
  if (!project) throw new Error('Project is no longer available. Refresh the project list.');
  state.error = undefined; publish();
  if (state.session?.project.id === id && ['running', 'degraded'].includes(state.session.status)) await rpc('start-all');
  else await rpc('start', project.path);
}
async function startProjectService(id: string, name: string) {
  const active = state.session?.project.id === id && ['running', 'degraded'].includes(state.session.status);
  const project = active ? state.session!.project : state.projects.find(p => p.id === id);
  if (!project || !project.services.some(s => s.name === name && s.enabled)) throw new Error('Unknown or disabled service. Refresh the project list.');
  if (active) await rpc('start-one', name);
  else await rpc('start-service', JSON.stringify({ path: project.path, name }));
}
async function stopProjectService(id: string, name: string) {
  if (state.session?.project.id !== id || !['running', 'degraded'].includes(state.session.status)) throw new Error('This project has no active session.');
  if (!state.session.services.some(s => s.name === name)) throw new Error('Unknown service. Refresh the project list.');
  await rpc('stop-one', name);
}
async function terminal() {
  if (!state.session || ['stopped', 'failed'].includes(state.session.status)) throw new Error('Start a project first.');
  const directory = await rpc<string>('log-directory');
  await openGhostty(state.session, directory, process.execPath, join(__dirname, 'follower.cjs'));
}
function registerIPC() {
  const configPath = (id: unknown) => {
    const project = state.projects.find(p => p.id === z.string().parse(id));
    if (!project) throw new Error('Unknown project. Refresh the project list.');
    return project.path;
  };
  const handlers: Record<string, (...args: any[]) => unknown> = {
    state: () => state, scan, start: (id: unknown) => startProject(z.string().parse(id)), stop: () => rpc('stop'),
    startService: (id: unknown, name: unknown) => startProjectService(z.string().parse(id), z.string().parse(name)),
    stopService: (id: unknown, name: unknown) => stopProjectService(z.string().parse(id), z.string().parse(name)),
    restart: (name: unknown) => rpc('restart', z.string().parse(name)), logs: (service: unknown) => rpc('logs', z.string().optional().parse(service)),
    saveSettings, addFolder: async () => {
      const selection = await dialog.showOpenDialog(window!, { properties: ['openDirectory', 'multiSelections'], title: 'Choose folders to search for devenv.toml' });
      if (!selection.canceled) await saveSettings({ ...state.settings, roots: [...new Set([...state.settings.roots, ...selection.filePaths])] });
    },
    openTerminal: terminal,
    openConfigFinder: async (id: unknown) => { shell.showItemInFolder((await readConfigDocument(configPath(id))).path); },
    openConfigTerminal: async (id: unknown) => { await openGhosttyDirectory(dirname((await readConfigDocument(configPath(id))).path)); },
    readConfig: (id: unknown) => readConfigDocument(configPath(id)),
    validateConfig: async (id: unknown, text: unknown): Promise<ConfigValidation> => {
      const path = configPath(id);
      try { await validateProjectText(path, z.string().max(1024 * 1024).parse(text)); return { valid: true }; }
      catch (error) {
        const source = error as { line?: number; col?: number };
        return { valid: false, message: message(error), line: source.line, column: source.col };
      }
    },
    saveConfig: async (id: unknown, text: unknown, revision: unknown) => {
      const result = await saveConfigDocument(configPath(id), z.string().parse(text), z.string().parse(revision));
      await scan(); return result;
    },
    checkUpdate: () => updater.check(state.settings.releaseRepo), saveToken: async (token: unknown) => { await updater.saveToken(z.string().max(1000).parse(token)); state.hasToken = await updater.hasToken(); publish(); },
    installUpdate: async () => {
      const path = await updater.download(state.settings.releaseRepo);
      await rpc('stop');
      const error = await shell.openPath(path); if (error) throw new Error(error);
      app.quit();
    },
  };
  for (const [name, handler] of Object.entries(handlers)) ipcMain.handle(`devenv:${name}`, async (event, ...args) => {
    if (!window || event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame) throw new Error('Untrusted IPC sender');
    try {
      const result = await handler(...args);
      if (!['state', 'logs'].includes(name)) { state.error = undefined; publish(); }
      return result;
    } catch (error) { report(error); throw error; }
  });
}
async function boot() {
  const root = app.getPath('userData'); await mkdir(root, { recursive: true, mode: 0o700 });
  await refreshTheme();
  try {
    const saved = JSON.parse(await readFile(join(root, 'settings.json'), 'utf8'));
    state.settings = { ...defaults, ...saved, appearance: saved.appearance === 'light' ? 'light' : 'dark' };
  }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') state.error = 'Settings could not be read. Defaults are in use.'; }
  nativeTheme.themeSource = state.settings.appearance;
  // Electron's net.fetch cancels manual redirects, which GitHub uses for release assets.
  updater = new Updater(root, app.getVersion(), process.arch, update => { state.update = update; publish(); });
  state.hasToken = await updater.hasToken();
  worker = fork(join(__dirname, 'supervisor.cjs'), [root, state.settings.shell], { execPath: process.execPath, env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, detached: true, stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
  worker.on('message', (data: { id?: number; value?: unknown; error?: string; event?: string; session?: Session; entry?: unknown }) => {
    if (data.id) {
      const request = requests.get(data.id); requests.delete(data.id);
      if (data.error) request?.reject(new Error(data.error)); else request?.resolve(data.value);
    } else if (data.event === 'ready') { ready = true; publish(); }
    else if (data.event === 'state') { state.session = data.session ?? null; publish(); }
    else if (data.event === 'log') window?.webContents.send('devenv:log', data.entry);
    else if (data.event === 'fatal') report(data.error);
  });
  worker.on('error', report);
  worker.on('exit', code => {
    ready = false; for (const request of requests.values()) request.reject(new Error('Session supervisor exited')); requests.clear();
    if (!quitting) report(`Session supervisor exited (${code}). Reopen Devenv to recover and clean up the previous session.`);
  });
  worker.stderr?.on('data', data => console.error(data.toString()));
  // Packaged builds take their icon from build/icon.icns; show the same icon in the dock during development.
  if (!app.isPackaged) app.dock?.setIcon(join(app.getAppPath(), 'build/icon.png'));
  registerIPC(); createWindow();
  tray = new Tray(trayImage()); updateTray();
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: 'Devenv', submenu: [{ role: 'about' }, { label: 'Check for updates…', click: () => action(() => updater.check(state.settings.releaseRepo)) }, { type: 'separator' }, { role: 'hide' }, { role: 'hideOthers' }, { role: 'unhide' }, { type: 'separator' }, { label: 'Quit Devenv', accelerator: 'Command+Q', click: () => app.quit() }] },
    { role: 'editMenu' }, { role: 'viewMenu' }, { role: 'windowMenu' },
  ]));
  if (app.isPackaged) {
    const checkForUpdates = () => { if (!quitRequested) void updater.check(state.settings.releaseRepo); };
    updateStartTimer = setTimeout(checkForUpdates, 4000);
    updatePollTimer = setInterval(checkForUpdates, UPDATE_CHECK_INTERVAL_MS);
  }
  await scan();
}
app.on('second-instance', show);
app.on('activate', show);
app.on('window-all-closed', () => {});
app.on('before-quit', event => {
  if (quitting) return;
  event.preventDefault(); if (quitRequested) return; quitRequested = true;
  void (async () => {
    try {
      if (ready) await rpc('stop');
      else if (state.session && !['stopped', 'failed'].includes(state.session.status)) throw new Error('The supervisor is unavailable. Reopen the app to recover the session before quitting.');
      quitting = true; watchers.forEach(w => w.close()); clearTimeout(scanTimer);
      clearTimeout(updateStartTimer); clearInterval(updatePollTimer);
      if (worker?.connected) worker.disconnect(); app.quit();
    } catch (error) { quitRequested = false; report(error); show(); }
  })();
});
if (single) void app.whenReady().then(boot).catch(report);
