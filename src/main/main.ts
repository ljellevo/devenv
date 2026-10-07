import appIcon from '../../build/icon.png';
import { WslClient, distributions, wslUNC, explorerPath, translatePath } from '../core/wsl';
import { windowsListenerOwners, wslNetworkingProcess } from '../core/port-inspection';
import { posix } from 'node:path';
import { openWslTerminal } from './terminal-backends';
import type { Project } from '../shared/types';
import { platform, defaultShell, executable } from '../core/platform';
import { terminalsFor } from '../shared/terminals';
import { linuxBackend } from './terminal-backends';
import { app, BrowserWindow, Menu, Tray, nativeImage, nativeTheme, ipcMain, dialog, shell, powerMonitor } from 'electron';
import { fork, type ChildProcess } from 'node:child_process';
import { mkdir, readFile, writeFile, rename, stat, realpath, access } from 'node:fs/promises';
import { watch, type FSWatcher } from 'node:fs';
import { join, resolve, isAbsolute, dirname, basename } from 'node:path';
import { homedir } from 'node:os';
import { z } from 'zod';
import { discover, projectId, validateProjectText } from '../core/config';
import { coveredBySearchRoot, createProjectConfig } from '../core/project-create';
import { readConfigDocument, saveConfigDocument } from '../core/config-files';
import { themeFromZshrc } from '../core/theme';
import { message } from '../core/process';
import { Updater } from '../core/updater';
import { startUpdatePolling } from '../core/update-polling';
import { openDirectoryTerminal, openSessionTerminal } from './terminals';
import { terminalApps, terminalLabel } from '../shared/terminals';
import trayIcon from './trayTemplate.png';
import trayIcon2x from './trayTemplate@2x.png';
import type { AppState, ConfigValidation, InstallState, Settings, Session, TerminalApp } from '../shared/types';

app.setName('Devenv');
if (process.env.DEVENV_SMOKE_TEST === '1' && process.argv.includes('--devenv-smoke-test')) { const profile = process.argv.find(arg => arg.startsWith('--user-data-dir='))?.slice('--user-data-dir='.length); if (!profile) throw new Error('Smoke tests require an isolated profile'); app.setPath('userData', resolve(profile)); }
if (process.env.DEVENV_DATA_DIR && !app.isPackaged) app.setPath('userData', resolve(process.env.DEVENV_DATA_DIR));
const single = app.requestSingleInstanceLock();
if (!single) app.quit();
let window: BrowserWindow | undefined;
let tray: Tray;
let worker: ChildProcess;
let activeWsl: WslClient | undefined;
const companions = new Map<string, WslClient>();
function companion(distribution: string) {
  let client = companions.get(distribution);
  if (!client) {
    client = new WslClient(distribution, app.isPackaged ? join(process.resourcesPath, 'companion-linux-x64.tar.gz') : join(app.getAppPath(), 'dist/companion-linux-x64.tar.gz'), app.getVersion());
    const current = client;
    // The companion stops its services when the connection drops; the next request reconnects and recovers its journal.
    client.on('failure', error => { if (activeWsl !== current) return; state.session = null; state.installState = null; report(error); });
    client.on('message', data => { if (activeWsl === current) receiveSupervisor(data as Parameters<typeof receiveSupervisor>[0]); });
    companions.set(distribution, client);
  }
  return client;
}
async function activateTarget(project: Project) {
  const target = project.executionTarget;
  const next = target?.kind === 'wsl' ? companion(target.distribution) : undefined;
  if (activeWsl === next) return;
  if (state.installState?.status === 'running') throw new Error('Wait for installation to finish before switching execution targets.');
  await rpc('stop');
  if (next) await next.connect();
  activeWsl = next; state.session = null; state.installState = null; state.installOutput = ''; publish();
}
async function checkWindowsPorts(project: Project) {
  if (project.executionTarget?.kind !== 'wsl') return;
  for (const port of project.services.filter(service => service.enabled).flatMap(service => service.ports)) {
    const owners = (await windowsListenerOwners(port)).filter(owner => !wslNetworkingProcess(owner.name));
    if (owners.length) throw new Error(`Windows port ${port} is occupied by ${owners.map(owner => `${owner.name || 'an inaccessible process'} (PID ${owner.pid})`).join(', ')}. Stop it manually before starting this WSL project.`);
  }
}
let updater: Updater;
let ready = false, quitting = false, quitRequested = false;
let sequence = 0;
let transitionQueue: Promise<unknown> = Promise.resolve();
function transition<T>(action: () => Promise<T>) { const next = transitionQueue.then(action); transitionQueue = next.catch(() => {}); return next; }
const requests = new Map<number, { resolve(value: any): void; reject(error: Error): void }>();
const defaults: Settings = { roots: [], exclusions: [], shell: process.env.SHELL || (process.platform === 'win32' ? 'powershell.exe' : '/bin/bash'), releaseRepo: 'ljellevo/devenv', appearance: 'system', terminal: 'terminal', projectFolders: [], projectFolderAssignments: {}, projectTreeOrder: {}, sidebarPinned: false, onboardingCompleted: false };
const state: AppState = { hostPlatform: platform, projects: [], settings: defaults, session: null, installState: null, installOutput: '', scanning: false, scanErrors: [], update: { status: 'idle', current: app.getVersion() }, hasToken: false, theme: themeFromZshrc(''), installedTerminals: [] };
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
  if (activeWsl) return activeWsl.request<T>(method, value);
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
  window = new BrowserWindow({ width: Math.max(1400, minWindowWidth()), height: MIN_HEIGHT, minWidth: minWindowWidth(), minHeight: MIN_HEIGHT, title: 'Devenv', ...(platform !== 'macos' ? { icon: nativeImage.createFromDataURL(appIcon) } : {}), ...(platform === 'macos' ? { titleBarStyle: 'hiddenInset' as const, transparent: true, vibrancy: 'menu' as const, visualEffectState: 'active' as const, backgroundColor: '#00000000' } : {}), webPreferences: { preload: join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true } });
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', event => event.preventDefault());
  const url = !app.isPackaged && process.env.DEVENV_RENDERER_URL;
  if (url) void window.loadURL(url); else void window.loadFile(join(__dirname, 'renderer/index.html'));
  window.on('close', event => { if (!quitting) { event.preventDefault(); window?.hide(); } });
  window.on('focus', () => { void refreshTheme(); clearTimeout(scanTimer); scanTimer = setTimeout(() => action(scan), 300); checkUpdatesIfDue(); });
}
// A hint for the terminal picker only; an app installed elsewhere can still be chosen.
async function findTerminals() {
  if (platform !== 'macos') {
    state.installedTerminals = [];
    for (const terminal of terminalsFor(platform)) {
      const found = platform === 'linux' ? await linuxBackend(terminal.value).then(() => true, () => false) : !!(await executable(terminal.value === 'terminal' ? 'wt' : 'pwsh') ?? (terminal.value === 'powershell' ? await executable('powershell') : undefined));
      if (found) state.installedTerminals.push(terminal.value);
    }
    return;
  }
  const folders = ['/Applications', '/Applications/Utilities', '/System/Applications/Utilities', join(homedir(), 'Applications')];
  const found = await Promise.all(terminalsFor(platform).map(async ({ value, bundle }) => (await Promise.any(folders.map(folder => access(join(folder, bundle)))).then(() => true, () => false)) ? value : undefined));
  state.installedTerminals = found.filter((value): value is TerminalApp => !!value);
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
  if (platform === 'macos') tray.setTitle(active ? session.project.name : '');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: active ? `${session.project.name} · ${session.status}` : 'No active project', enabled: false },
    { type: 'separator' },
    ...state.projects.map(project => ({ label: project.name, type: 'checkbox' as const, checked: !!active && session.project.id === project.id, enabled: !project.error && !project.draft && ready && !['starting', 'stopping'].includes(session?.status ?? ''), click: () => action(() => transition(() => project.install && !project.installed ? installProject(project.id) : startProject(project.id))) })),
    { type: 'separator' },
    { label: 'Stop project', enabled: !!active, click: () => action(() => rpc('stop')) },
    { label: `Open in ${terminalLabel(state.settings.terminal, platform)}`, enabled: !!active, click: () => action(terminal) },
    { label: 'Show Devenv', click: show },
    { label: 'Check for updates', click: () => { show(); action(() => updater.check(state.settings.releaseRepo)); } },
    { type: 'separator' }, { label: 'Quit Devenv', accelerator: 'CommandOrControl+Q', click: () => app.quit() },
  ]));
}
function trayImage() {
  if (platform !== 'macos') return nativeImage.createFromDataURL(appIcon).resize({ width: 24, height: 24 });
  // Two opposing arrows (build/tray.svg), rendered as a native macOS template image.
  const image = nativeImage.createEmpty();
  image.addRepresentation({ scaleFactor: 1, dataURL: trayIcon });
  image.addRepresentation({ scaleFactor: 2, dataURL: trayIcon2x });
  image.setTemplateImage(platform === 'macos'); return image;
}
async function saveSettings(settings: Settings) {
  const previous = state.settings;
  const next = z.object({ projectTargets: z.record(z.discriminatedUnion('kind', [z.object({ kind: z.literal('native') }), z.object({ kind: z.literal('wsl'), distribution: z.string().min(1) })])).optional(), searchRoots: z.array(z.object({ path: z.string().min(1), target: z.discriminatedUnion('kind', [z.object({ kind: z.literal('native') }), z.object({ kind: z.literal('wsl'), distribution: z.string().min(1) })]) })).max(30).optional(), roots: z.array(z.string().min(1)).max(30), exclusions: z.array(z.string().min(1)).max(100), shell: z.string().min(1), releaseRepo: z.string().regex(/^[\w.-]+\/[\w.-]+$/), appearance: z.enum(['light', 'dark', 'system']), terminal: z.enum(['terminal', 'iterm', 'ghostty', 'powershell']), projectFolders: z.array(z.object({ id: z.string().uuid(), name: z.string().trim().min(1).max(80), parentId: z.string().uuid().nullable() }).strict()).max(200), projectFolderAssignments: z.record(z.string().uuid()), projectTreeOrder: z.record(z.array(z.string().min(1).max(100)).max(5000)), sidebarPinned: z.boolean(), onboardingCompleted: z.boolean() }).strict().parse(settings);
  if (!terminalsFor(platform).some(t => t.value === next.terminal)) throw new Error('Terminal is not supported on this platform.');
  if (JSON.stringify(next.projectTargets) !== JSON.stringify(previous.projectTargets) && (state.installState?.status === 'running' || state.session && !['stopped', 'failed'].includes(state.session.status))) throw new Error('Stop active work before changing execution targets.');
  next.searchRoots = [...next.roots.map(path => ({ path, target: { kind: 'native' as const } })), ...(next.searchRoots ?? []).filter(root => root.target.kind === 'wsl')];
  if (platform !== 'windows' && next.searchRoots.some(root => root.target.kind === 'wsl')) throw new Error('WSL folders require a Windows host.');
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
  // Native Windows commands are always encoded as PowerShell scripts.
  if (platform === 'windows' && !/^(?:pwsh|powershell)(?:\.exe)?$/i.test(basename(next.shell))) throw new Error('On Windows, the shell must be PowerShell 7 (pwsh.exe) or Windows PowerShell (powershell.exe).');
  if (next.searchRoots.some(root => root.target.kind === 'wsl' && (!posix.isAbsolute(root.path) || root.path.includes('\0')))) throw new Error('WSL search folders must use absolute Linux paths.');
  if (next.roots.some(root => !isAbsolute(root))) throw new Error('Search folders must use absolute paths.');
  if (next.shell !== previous.shell) {
    if (state.installState?.status === 'running') throw new Error('Stop installation before changing shells.');
    if (state.session && !['stopped', 'failed'].includes(state.session.status)) throw new Error('Stop the session before changing shells.');
    if (activeWsl) throw new Error('Select a native project before changing the host shell.');
    await rpc('shell', next.shell);
  }
  const root = app.getPath('userData');
  await writeFile(join(root, 'settings.tmp'), JSON.stringify(next, null, 2), { mode: 0o600 });
  await rename(join(root, 'settings.tmp'), join(root, 'settings.json'));
  state.settings = next;
  nativeTheme.themeSource = next.appearance;
  applyWindowMinimum();
  publish();
  if (JSON.stringify(next.searchRoots) !== JSON.stringify(previous.searchRoots) || next.roots.join('\0') !== previous.roots.join('\0') || next.exclusions.join('\0') !== previous.exclusions.join('\0')) await scan();
}
async function scan() {
  if (state.scanning) { rescan = true; return; }
  state.scanning = true; publish();
  try {
    const result = await discover(state.settings.roots, state.settings.exclusions);
    for (let index = 0; index < result.projects.length; index++) {
      const project = result.projects[index], target = state.settings.projectTargets?.[project.path];
      if (target?.kind !== 'wsl') continue;
      try {
        const path = await translatePath(target.distribution, project.path);
        const remote = await companion(target.distribution).request<Project>('load-project', path);
        result.projects[index] = { ...remote, executionSourcePath: project.path };
      } catch (error) { result.projects[index] = { ...project, executionTarget: target, error: message(error) }; }
    }
    for (const root of state.settings.searchRoots ?? []) {
      if (root.target.kind !== 'wsl') continue;
      try {
        const remote = await companion(root.target.distribution).request<{ projects: Project[]; errors: string[] }>('discover', JSON.stringify({ roots: [root.path], exclusions: state.settings.exclusions }));
        result.projects.push(...remote.projects); result.errors.push(...remote.errors);
      } catch (error) { result.errors.push(`${root.target.distribution}: ${message(error)}`); }
    }
    state.projects = [...new Map(result.projects.map(project => [project.id, project])).values()].sort((a, b) => a.name.localeCompare(b.name)); state.scanErrors = result.errors;
    let migratedOrganization = false;
    for (const project of state.projects) {
      const target = project.executionTarget;
      if (target?.kind !== 'wsl') continue;
      const aliases = [explorerPath(target.distribution, project.path), explorerPath(target.distribution, project.path).replace('wsl.localhost', 'wsl$')];
      for (const alias of aliases) {
        const previousId = projectId(alias, { kind: 'native' });
        if (state.settings.projectFolderAssignments[previousId] && !state.settings.projectFolderAssignments[project.id]) { state.settings.projectFolderAssignments[project.id] = state.settings.projectFolderAssignments[previousId]; migratedOrganization = true; }
        for (const [key, order] of Object.entries(state.settings.projectTreeOrder)) {
          if (order.includes(`p:${previousId}`)) { state.settings.projectTreeOrder[key] = [...new Set(order.map(item => item === `p:${previousId}` ? `p:${project.id}` : item))]; migratedOrganization = true; }
        }
      }
    }
    if (migratedOrganization) {
      const directory = app.getPath('userData');
      await writeFile(join(directory, 'settings.migration.tmp'), JSON.stringify(state.settings, null, 2), { mode: 0o600 });
      await rename(join(directory, 'settings.migration.tmp'), join(directory, 'settings.json'));
    }
    watchers.forEach(w => w.close()); watchers = [];
    // Shallow watches avoid attaching watchers to dependency trees. Focus/Refresh discovers new nested configs.
    for (const path of new Set([...state.settings.roots, ...state.projects.filter(p => p.executionTarget?.kind !== 'wsl').map(p => dirname(p.path))])) {
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
  await activateTarget(project);
  if (!(state.session?.project.id === project.id && ['running', 'degraded'].includes(state.session.status))) await checkWindowsPorts(project);
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
  await activateTarget(project);
  try { await rpc('install', JSON.stringify({ path: project.path, mode })); }
  finally { await scan(); }
}
async function startProjectService(id: string, name: string) {
  const active = state.session?.project.id === id && ['running', 'degraded'].includes(state.session.status);
  const project = active ? state.session!.project : state.projects.find(p => p.id === id);
  if (!project || !project.services.some(s => s.name === name && s.enabled)) throw new Error('Unknown or disabled service. Refresh the project list.');
  await activateTarget(project);
  if (!active) await checkWindowsPorts(project);
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
  if (activeWsl) {
    for (const service of state.session.project.services.filter(service => service.enabled)) await openWslTerminal(state.settings.terminal, activeWsl.distribution, service.cwd, { runtime: activeWsl.runtimeDirectory, directory, service: service.name, title: `${state.session.project.name} · ${service.name}` });
    return;
  }
  await openSessionTerminal(state.settings.terminal, state.session, directory, process.execPath, join(__dirname, 'follower.cjs'));
}
function registerIPC() {
  const configPath = (id: unknown) => {
    const project = state.projects.find(p => p.id === z.string().parse(id));
    if (!project) throw new Error('Unknown project. Refresh the project list.');
    return project.path;
  };
  const configProject = (id: unknown) => state.projects.find(project => project.id === z.string().parse(id)) ?? (() => { throw new Error('Unknown project'); })();
  const configCompanion = (id: unknown) => { const target = configProject(id).executionTarget; return target?.kind === 'wsl' ? companion(target.distribution) : undefined; };
  const handlers: Record<string, (...args: any[]) => unknown> = {
    setProjectTarget: async (id: unknown, targetValue: unknown) => {
      const project = configProject(id);
      if (platform !== 'windows') throw new Error('Execution target selection requires Windows.');
      if (state.installState?.status === 'running' || state.session && !['stopped', 'failed'].includes(state.session.status)) throw new Error('Stop active work before changing execution targets.');
      const target = z.discriminatedUnion('kind', [z.object({ kind: z.literal('native') }), z.object({ kind: z.literal('wsl'), distribution: z.string().min(1) })]).parse(targetValue);
      const source = project.executionSourcePath ?? (project.executionTarget?.kind !== 'wsl' ? project.path : undefined);
      if (!source) throw new Error('Linux filesystem projects remain in their search folder distribution. Add a mounted Windows folder to use native execution.');
      let nextId = projectId(source);
      if (target.kind === 'wsl') { const path = await translatePath(target.distribution, source); const remote = await companion(target.distribution).request<Project>('load-project', path); nextId = remote.id; }
      const settings = { ...state.settings, projectTargets: { ...state.settings.projectTargets, [source]: target }, projectFolderAssignments: { ...state.settings.projectFolderAssignments }, projectTreeOrder: { ...state.settings.projectTreeOrder } };
      if (nextId !== project.id && settings.projectFolderAssignments[project.id]) { settings.projectFolderAssignments[nextId] = settings.projectFolderAssignments[project.id]; delete settings.projectFolderAssignments[project.id]; }
      for (const [key, order] of Object.entries(settings.projectTreeOrder)) settings.projectTreeOrder[key] = order.map(item => item === `p:${project.id}` ? `p:${nextId}` : item);
      await saveSettings(settings); await scan(); return nextId;
    },
    wslDistributions: distributions,
    wslDirectories: (distribution: unknown, path: unknown) => companion(z.string().min(1).parse(distribution)).request('directories', z.string().optional().parse(path)),
    addWslFolder: async (distribution: unknown, path: unknown) => {
      const name = z.string().min(1).parse(distribution);
      const result = await companion(name).request<{ path: string }>('directories', z.string().min(1).parse(path));
      const roots = state.settings.searchRoots ?? [];
      if (!roots.some(root => root.path === result.path && root.target.kind === 'wsl' && root.target.distribution === name)) await saveSettings({ ...state.settings, searchRoots: [...roots, { path: result.path, target: { kind: 'wsl', distribution: name } }] });
    },
    state: () => state, scan, start: (id: unknown) => startProject(z.string().parse(id)), stop: () => rpc('stop'),
    install: (id: unknown, mode: unknown) => installProject(z.string().parse(id), z.enum(['resume', 'restart']).default('resume').parse(mode)),
    cancelInstall: () => rpc('install-cancel'), installInput: (data: unknown) => rpc('install-input', z.string().max(8192).parse(data)),
    installResize: (cols: unknown, rows: unknown) => rpc('install-resize', JSON.stringify({ cols: z.number().int().min(1).max(500).parse(cols), rows: z.number().int().min(1).max(200).parse(rows) })),
    startService: (id: unknown, name: unknown) => startProjectService(z.string().parse(id), z.string().parse(name)),
    stopService: (id: unknown, name: unknown) => stopProjectService(z.string().parse(id), z.string().parse(name)),
    restart: (name: unknown) => rpc('restart', z.string().parse(name)), logs: (service: unknown) => rpc('logs', z.string().optional().parse(service)),
    saveSettings, addFolder: async () => {
      const selection = await dialog.showOpenDialog(window!, { properties: ['openDirectory', 'multiSelections'], title: 'Choose folders to search for devenv.toml' });
      if (!selection.canceled) {
        const roots = [...state.settings.roots]; const remote = [...(state.settings.searchRoots ?? []).filter(root => root.target.kind === 'wsl')];
        for (const path of selection.filePaths) { const unc = wslUNC(path); if (unc) { await companion(unc.distribution).request('directories', unc.path); remote.push({ path: unc.path, target: { kind: 'wsl', distribution: unc.distribution } }); } else roots.push(path); }
        await saveSettings({ ...state.settings, roots: [...new Set(roots)], searchRoots: remote });
      }
    },
    createProject: async (): Promise<{ id: string; path: string } | null> => {
      const selection = await dialog.showOpenDialog(window!, { properties: ['openDirectory'], title: 'Choose a folder for the new devenv.toml' });
      if (selection.canceled || !selection.filePaths[0]) return null;
      const unc = wslUNC(selection.filePaths[0]);
      if (unc) {
        const project = await companion(unc.distribution).request<Project>('create-project', unc.path);
        const roots = state.settings.searchRoots ?? [];
        if (!roots.some(root => root.target.kind === 'wsl' && root.target.distribution === unc.distribution && (unc.path === root.path || unc.path.startsWith(root.path.replace(/\/$/, '') + '/')))) await saveSettings({ ...state.settings, searchRoots: [...roots, { path: unc.path, target: { kind: 'wsl', distribution: unc.distribution } }] });
        else await scan();
        return { id: project.id, path: project.path };
      }
      const directory = await realpath(selection.filePaths[0]);
      const covered = await coveredBySearchRoot(directory, state.settings.roots);
      if (!covered && state.settings.roots.length >= 30) throw new Error('Remove a search folder in Settings before creating another project.');
      const file = await createProjectConfig(directory);
      if (covered) await scan();
      else await saveSettings({ ...state.settings, roots: [...state.settings.roots, directory] });
      return { id: projectId(file), path: file };
    },
    openTerminal: terminal,
    openConfigFinder: async (id: unknown) => { const project = configProject(id); const target = project.executionTarget; if (target?.kind === 'wsl') { await configCompanion(id)!.request('read-config', project.path); shell.showItemInFolder(explorerPath(target.distribution, project.path)); } else shell.showItemInFolder((await readConfigDocument(project.path)).path); },
    openConfigTerminal: async (id: unknown) => { const project = configProject(id); const target = project.executionTarget; if (target?.kind === 'wsl') { await configCompanion(id)!.request('read-config', project.path); await openWslTerminal(state.settings.terminal, target.distribution, posix.dirname(project.path)); } else await openDirectoryTerminal(state.settings.terminal, dirname((await readConfigDocument(project.path)).path)); },
    readConfig: (id: unknown) => configCompanion(id)?.request('read-config', configPath(id)) ?? readConfigDocument(configPath(id)),
    validateConfig: async (id: unknown, text: unknown): Promise<ConfigValidation> => {
      const path = configPath(id);
      const remote = configCompanion(id);
      if (remote) return remote.request('validate-config', JSON.stringify({ path, text: z.string().max(1024 * 1024).parse(text) }));
      try { await validateProjectText(path, z.string().max(1024 * 1024).parse(text)); return { valid: true }; }
      catch (error) {
        const source = error as { line?: number; col?: number };
        return { valid: false, message: message(error), line: source.line, column: source.col };
      }
    },
    saveConfig: async (id: unknown, text: unknown, revision: unknown) => {
      const remote = configCompanion(id);
      const result = remote ? await remote.request('save-config', JSON.stringify({ path: configPath(id), text: z.string().max(1024 * 1024).parse(text), revision: z.string().parse(revision) })) : await saveConfigDocument(configPath(id), z.string().parse(text), z.string().parse(revision));
      await scan(); return result;
    },
    checkUpdate: () => updater.check(state.settings.releaseRepo), saveToken: async (token: unknown) => { await updater.saveToken(z.string().max(1000).parse(token)); state.hasToken = await updater.hasToken(); publish(); },
    installUpdate: async () => {
      const path = await updater.download(state.settings.releaseRepo);
      await rpc('install-cancel');
      await rpc('stop');
      if (path.endsWith('.AppImage')) { shell.showItemInFolder(path); await dialog.showMessageBox(window!, { message: 'Quit Devenv, replace your old AppImage with the downloaded file, make it executable, and launch it.' }); return; }
      const error = await shell.openPath(path); if (error) throw new Error(error);
      app.quit();
    },
  };
  for (const [name, handler] of Object.entries(handlers)) ipcMain.handle(`devenv:${name}`, async (event, ...args) => {
    if (!window || event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame) throw new Error('Untrusted IPC sender');
    try {
      const result = await (['start', 'startService', 'install', 'setProjectTarget', 'restart'].includes(name) ? transition(async () => handler(...args)) : handler(...args));
      if (!['state', 'logs'].includes(name)) { state.error = undefined; publish(); }
      return result;
    } catch (error) { report(error); throw error; }
  });
}
function receiveSupervisor(data: { id?: number; value?: unknown; error?: string; event?: string; session?: Session; entry?: unknown; state?: InstallState; output?: string }) {
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
}
async function boot() {
  const root = app.getPath('userData'); await mkdir(root, { recursive: true, mode: 0o700 });
  defaults.shell = await defaultShell();
  await Promise.all([refreshTheme(), findTerminals()]);
  // Windows Terminal is optional on Windows 10; fall back to standalone PowerShell windows.
  if (platform === 'windows' && !state.installedTerminals.includes('terminal')) defaults.terminal = 'powershell';
  try {
    const saved = JSON.parse(await readFile(join(root, 'settings.json'), 'utf8'));
    state.settings = { ...defaults, ...saved, appearance: ['light', 'dark', 'system'].includes(saved.appearance) ? saved.appearance : defaults.appearance, terminal: terminalsFor(platform).some(t => t.value === saved.terminal) ? saved.terminal : defaults.terminal, projectFolders: Array.isArray(saved.projectFolders) ? saved.projectFolders : [], projectFolderAssignments: saved.projectFolderAssignments && typeof saved.projectFolderAssignments === 'object' ? saved.projectFolderAssignments : {}, projectTreeOrder: saved.projectTreeOrder && typeof saved.projectTreeOrder === 'object' ? saved.projectTreeOrder : {}, sidebarPinned: saved.sidebarPinned === true, onboardingCompleted: typeof saved.onboardingCompleted === 'boolean' ? saved.onboardingCompleted : Array.isArray(saved.roots) && saved.roots.length > 0 };
  }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') state.error = 'Settings could not be read. Defaults are in use.'; }
  // Migrate native roots without changing native project IDs or folder assignments.
  const migrated = state.settings.roots.flatMap(path => { const unc = platform === 'windows' && wslUNC(path); return unc ? [{ path: unc.path, target: { kind: 'wsl' as const, distribution: unc.distribution } }] : []; });
  state.settings.roots = state.settings.roots.filter(path => !wslUNC(path));
  state.settings.searchRoots = [...state.settings.roots.map(path => ({ path, target: { kind: 'native' as const } })), ...(state.settings.searchRoots ?? []).filter(root => root.target.kind === 'wsl'), ...migrated];
  nativeTheme.themeSource = state.settings.appearance;
  // Electron's net.fetch cancels manual redirects, which GitHub uses for release assets.
  updater = new Updater(root, app.getVersion(), process.arch, update => { state.update = update; publish(); });
  state.hasToken = await updater.hasToken();
  worker = fork(join(__dirname, 'supervisor.cjs'), [root, state.settings.shell], { execPath: process.execPath, env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, detached: true, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
  worker.on('message', data => { if (!activeWsl || (data as { id?: number }).id) receiveSupervisor(data as Parameters<typeof receiveSupervisor>[0]); });
  worker.on('error', report);
  worker.on('exit', code => {
    ready = false; for (const request of requests.values()) request.reject(new Error('Session supervisor exited')); requests.clear();
    if (!quitRequested) report(`Session supervisor exited (${code}). Reopen Devenv to recover and clean up the previous session.`);
  });
  worker.stderr?.on('data', data => console.error(data.toString()));
  // Packaged builds take their icon from build/icon.icns; show the same icon in the dock during development.
  if (!app.isPackaged) app.dock?.setIcon(join(app.getAppPath(), 'build/icon.png'));
  registerIPC(); createWindow();
  tray = new Tray(trayImage()); updateTray();
  // Windows and Linux trays open the app on click; the context menu stays on right-click.
  if (platform !== 'macos') tray.on('click', show);
  Menu.setApplicationMenu(platform === 'macos' ? Menu.buildFromTemplate([
    { label: 'Devenv', submenu: [{ role: 'about' }, { label: 'Check for updates…', click: () => action(() => updater.check(state.settings.releaseRepo)) }, { type: 'separator' }, { role: 'hide' }, { role: 'hideOthers' }, { role: 'unhide' }, { type: 'separator' }, { label: 'Quit Devenv', accelerator: 'CommandOrControl+Q', click: () => app.quit() }] },
    { role: 'editMenu' }, { role: 'viewMenu' }, { role: 'windowMenu' },
  ]) : Menu.buildFromTemplate([{ label: 'File', submenu: [{ role: 'quit' }] }, { role: 'editMenu' }, { role: 'viewMenu' }]));
  if (app.isPackaged) {
    const checkForUpdates = () => { if (!quitRequested) void updater.check(state.settings.releaseRepo); };
    updatePoller = startUpdatePolling(checkForUpdates);
    powerMonitor.on('resume', checkUpdatesIfDue);
  }
  await scan();
  if (process.env.DEVENV_SMOKE_TEST === '1' && process.argv.includes('--devenv-smoke-test')) {
    await new Promise<void>((resolve, reject) => { const timer = setTimeout(() => reject(new Error('Supervisor startup timed out')), 15000); const check = setInterval(() => { if (ready) { clearTimeout(timer); clearInterval(check); resolve(); } }, 50); });
    await window!.webContents.executeJavaScript(`new Promise((resolve, reject) => { const deadline = Date.now() + 10000; const check = setInterval(() => { if (document.querySelector('button')) { clearInterval(check); resolve(true); } else if (Date.now() > deadline) { clearInterval(check); reject(new Error('Renderer did not mount')); } }, 50); })`);
    app.quit();
  }
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
      watchers.forEach(w => w.close()); clearTimeout(scanTimer);
      updatePoller?.stop(); powerMonitor.off('resume', checkUpdatesIfDue);
      for (const client of companions.values()) await client.close();
      if (worker?.connected) { await new Promise<void>(resolve => { worker.once('exit', () => resolve()); worker.disconnect(); }); } quitting = true; app.quit();
    } catch (error) { quitRequested = false; report(error); show(); }
  })();
});
if (single) void app.whenReady().then(boot).catch(report);
