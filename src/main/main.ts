import { app, BrowserWindow, Menu, Tray, nativeImage, nativeTheme, ipcMain, dialog, shell, powerMonitor } from 'electron';
import { fork, type ChildProcess } from 'node:child_process';
import { mkdir, readFile, writeFile, rename, stat, realpath } from 'node:fs/promises';
import { watch, type FSWatcher } from 'node:fs';
import { join, resolve, isAbsolute, dirname } from 'node:path';
import { homedir } from 'node:os';
import { z } from 'zod';
import { discover, projectId, validateProjectText } from '../core/config';
import { coveredBySearchRoot, createProjectConfig } from '../core/project-create';
import { readConfigDocument, saveConfigDocument } from '../core/config-files';
import { themeFromZshrc } from '../core/theme';
import { message } from '../core/process';
import { Updater } from '../core/updater';
import { startUpdatePolling } from '../core/update-polling';
import { openGhostty, openGhosttyDirectory } from './ghostty';
import trayIcon from './trayTemplate.png';
import trayIcon2x from './trayTemplate@2x.png';
import type { AppState, ConfigValidation, InstallState, Settings, Session } from '../shared/types';

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
const defaults: Settings = { roots: [], exclusions: [], shell: process.env.SHELL || '/bin/zsh', releaseRepo: 'ljellevo/devenv', appearance: 'system', projectFolders: [], projectFolderAssignments: {}, projectTreeOrder: {}, sidebarPinned: false, onboardingCompleted: false };
const state: AppState = { projects: [], settings: defaults, session: null, installState: null, installOutput: '', scanning: false, scanErrors: [], update: { status: 'idle', current: app.getVersion() }, hasToken: false, theme: themeFromZshrc('') };
let installOutputTimer: ReturnType<typeof setTimeout> | undefined;
let watchers: FSWatcher[] = [];
let scanTimer: ReturnType<typeof setTimeout>;
let updatePoller: ReturnType<typeof startUpdatePolling> | undefined;
let rescan = false;
function checkUpdatesIfDue() { updatePoller?.checkIfDue(); }

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
// The pinned sidebar (w-[270px] in App.tsx) sits beside the content, so the window needs room for both.
const MIN_WIDTH = 1200, PINNED_MIN_WIDTH = 1525, MIN_HEIGHT = 820;
function minWindowWidth() { return state.settings.sidebarPinned ? PINNED_MIN_WIDTH : MIN_WIDTH; }
function applyWindowMinimum() {
  if (!window || window.isDestroyed()) return;
  const min = minWindowWidth();
  window.setMinimumSize(min, MIN_HEIGHT);
  const [width, height] = window.getSize();
  if (width < min) window.setSize(min, height);
}
function createWindow() {
  window = new BrowserWindow({ width: Math.max(1400, minWindowWidth()), height: MIN_HEIGHT, minWidth: minWindowWidth(), minHeight: MIN_HEIGHT, title: 'Devenv', titleBarStyle: 'hiddenInset', transparent: true, vibrancy: 'menu', visualEffectState: 'active', backgroundColor: '#00000000', webPreferences: { preload: join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true } });
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', event => event.preventDefault());
  const url = !app.isPackaged && process.env.DEVENV_RENDERER_URL;
  if (url) void window.loadURL(url); else void window.loadFile(join(__dirname, 'renderer/index.html'));
  window.on('close', event => { if (!quitting) { event.preventDefault(); window?.hide(); } });
  window.on('focus', () => { void refreshTheme(); clearTimeout(scanTimer); scanTimer = setTimeout(() => action(scan), 300); checkUpdatesIfDue(); });
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
    ...state.projects.map(project => ({ label: project.name, type: 'checkbox' as const, checked: !!active && session.project.id === project.id, enabled: !project.error && !project.draft && ready && !['starting', 'stopping'].includes(session?.status ?? ''), click: () => action(() => project.install && !project.installed ? installProject(project.id) : startProject(project.id)) })),
    { type: 'separator' },
    { label: 'Stop project', enabled: !!active, click: () => action(() => rpc('stop')) },
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
  const next = z.object({ roots: z.array(z.string().min(1)).max(30), exclusions: z.array(z.string().min(1)).max(100), shell: z.string().min(1), releaseRepo: z.string().regex(/^[\w.-]+\/[\w.-]+$/), appearance: z.enum(['light', 'dark', 'system']), projectFolders: z.array(z.object({ id: z.string().uuid(), name: z.string().trim().min(1).max(80), parentId: z.string().uuid().nullable() }).strict()).max(200), projectFolderAssignments: z.record(z.string().uuid()), projectTreeOrder: z.record(z.array(z.string().min(1).max(100)).max(5000)), sidebarPinned: z.boolean(), onboardingCompleted: z.boolean() }).strict().parse(settings);
  const folderIds = new Set(next.projectFolders.map(folder => folder.id));
  if (folderIds.size !== next.projectFolders.length) throw new Error('Project folders must have unique IDs.');
  for (const folder of next.projectFolders) {
    const seen = new Set([folder.id]);
    let parentId = folder.parentId;
    while (parentId) {
      if (!folderIds.has(parentId) || seen.has(parentId)) throw new Error('Project folders have an invalid parent.');
      seen.add(parentId);
      parentId = next.projectFolders.find(item => item.id === parentId)!.parentId;
    }
  }
  if (Object.values(next.projectFolderAssignments).some(id => !folderIds.has(id))) throw new Error('A project is assigned to an unknown folder.');
  if (Object.values(next.projectTreeOrder).some(items => new Set(items).size !== items.length)) throw new Error('Project tree order contains duplicate entries.');
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
  applyWindowMinimum();
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
  if (project.draft) throw new Error('Add services to devenv.toml before starting this project.');
  if (project.error) throw new Error(project.error);
  if (project.install && !project.installed) throw new Error('Install this project before running it.');
  state.error = undefined; publish();
  try {
    if (state.session?.project.id === id && ['running', 'degraded'].includes(state.session.status)) await rpc('start-all');
    else await rpc('start', project.path);
  } catch (error) { await scan(); throw error; }
}
async function installProject(id: string, mode: 'resume' | 'restart' = 'resume') {
  const project = state.projects.find(p => p.id === id);
  if (!project?.install) throw new Error('This project has no install recipe.');
  if (project.error || project.draft) throw new Error(project.error || 'Complete devenv.toml before installing.');
  try { await rpc('install', JSON.stringify({ path: project.path, mode })); }
  finally { await scan(); }
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
    install: (id: unknown, mode: unknown) => installProject(z.string().parse(id), z.enum(['resume', 'restart']).default('resume').parse(mode)),
    cancelInstall: () => rpc('install-cancel'), installInput: (data: unknown) => rpc('install-input', z.string().max(8192).parse(data)),
    installResize: (cols: unknown, rows: unknown) => rpc('install-resize', JSON.stringify({ cols: z.number().int().min(1).max(500).parse(cols), rows: z.number().int().min(1).max(200).parse(rows) })),
    startService: (id: unknown, name: unknown) => startProjectService(z.string().parse(id), z.string().parse(name)),
    stopService: (id: unknown, name: unknown) => stopProjectService(z.string().parse(id), z.string().parse(name)),
    restart: (name: unknown) => rpc('restart', z.string().parse(name)), logs: (service: unknown) => rpc('logs', z.string().optional().parse(service)),
    saveSettings, addFolder: async () => {
      const selection = await dialog.showOpenDialog(window!, { properties: ['openDirectory', 'multiSelections'], title: 'Choose folders to search for devenv.toml' });
      if (!selection.canceled) await saveSettings({ ...state.settings, roots: [...new Set([...state.settings.roots, ...selection.filePaths])] });
    },
    createProject: async (): Promise<{ id: string; path: string } | null> => {
      const selection = await dialog.showOpenDialog(window!, { properties: ['openDirectory'], title: 'Choose a folder for the new devenv.toml' });
      if (selection.canceled || !selection.filePaths[0]) return null;
      const directory = await realpath(selection.filePaths[0]);
      const covered = await coveredBySearchRoot(directory, state.settings.roots);
      if (!covered && state.settings.roots.length >= 30) throw new Error('Remove a search folder in Settings before creating another project.');
      const file = await createProjectConfig(directory);
      if (covered) await scan();
      else await saveSettings({ ...state.settings, roots: [...state.settings.roots, directory] });
      return { id: projectId(file), path: file };
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
    state.settings = { ...defaults, ...saved, appearance: ['light', 'dark', 'system'].includes(saved.appearance) ? saved.appearance : defaults.appearance, projectFolders: Array.isArray(saved.projectFolders) ? saved.projectFolders : [], projectFolderAssignments: saved.projectFolderAssignments && typeof saved.projectFolderAssignments === 'object' ? saved.projectFolderAssignments : {}, projectTreeOrder: saved.projectTreeOrder && typeof saved.projectTreeOrder === 'object' ? saved.projectTreeOrder : {}, sidebarPinned: saved.sidebarPinned === true, onboardingCompleted: typeof saved.onboardingCompleted === 'boolean' ? saved.onboardingCompleted : Array.isArray(saved.roots) && saved.roots.length > 0 };
  }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') state.error = 'Settings could not be read. Defaults are in use.'; }
  nativeTheme.themeSource = state.settings.appearance;
  // Electron's net.fetch cancels manual redirects, which GitHub uses for release assets.
  updater = new Updater(root, app.getVersion(), process.arch, update => { state.update = update; publish(); });
  state.hasToken = await updater.hasToken();
  worker = fork(join(__dirname, 'supervisor.cjs'), [root, state.settings.shell], { execPath: process.execPath, env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, detached: true, stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
  worker.on('message', (data: { id?: number; value?: unknown; error?: string; event?: string; session?: Session; entry?: unknown; state?: InstallState; output?: string }) => {
    if (data.id) {
      const request = requests.get(data.id); requests.delete(data.id);
      if (data.error) request?.reject(new Error(data.error)); else request?.resolve(data.value);
    } else if (data.event === 'ready') { ready = true; publish(); }
    else if (data.event === 'state') { state.session = data.session ?? null; publish(); }
    else if (data.event === 'log') window?.webContents.send('devenv:log', data.entry);
    else if (data.event === 'install-state') { if (data.state?.status === 'running' && data.state.stepIndex === undefined) state.installOutput = ''; state.installState = data.state ?? null; publish(); }
    else if (data.event === 'install-output') {
      state.installOutput = (state.installOutput + (data.output ?? '')).slice(-120000);
      if (!installOutputTimer) installOutputTimer = setTimeout(() => { installOutputTimer = undefined; if (window && !window.isDestroyed()) window.webContents.send('devenv:state', state); }, 80);
    }
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
    updatePoller = startUpdatePolling(checkForUpdates);
    powerMonitor.on('resume', checkUpdatesIfDue);
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
      if (ready) { await rpc('install-cancel'); await rpc('stop'); }
      else if (state.session && !['stopped', 'failed'].includes(state.session.status)) throw new Error('The supervisor is unavailable. Reopen the app to recover the session before quitting.');
      quitting = true; watchers.forEach(w => w.close()); clearTimeout(scanTimer);
      updatePoller?.stop(); powerMonitor.off('resume', checkUpdatesIfDue);
      if (worker?.connected) worker.disconnect(); app.quit();
    } catch (error) { quitRequested = false; report(error); show(); }
  })();
});
if (single) void app.whenReady().then(boot).catch(report);
