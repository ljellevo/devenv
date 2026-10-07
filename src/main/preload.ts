import { contextBridge, ipcRenderer } from 'electron';
import type { DesktopAPI } from '../shared/types';
const invoke = (name: string, ...args: unknown[]) => ipcRenderer.invoke(`devenv:${name}`, ...args);
const subscribe = (name: string, callback: (value: any) => void) => {
  const listener = (_event: unknown, value: unknown) => callback(value);
  ipcRenderer.on(name, listener); return () => ipcRenderer.removeListener(name, listener);
};
const api: DesktopAPI = {
  setProjectTarget: (id, target) => invoke('setProjectTarget', id, target),
  wslDistributions: () => invoke('wslDistributions'), wslDirectories: (distribution, path) => invoke('wslDirectories', distribution, path), addWslFolder: (distribution, path) => invoke('addWslFolder', distribution, path),
  state: () => invoke('state'), scan: () => invoke('scan'), addFolder: () => invoke('addFolder'), createProject: () => invoke('createProject'),
  saveSettings: value => invoke('saveSettings', value), start: id => invoke('start', id), stop: () => invoke('stop'), restart: name => invoke('restart', name),
  install: (id, mode) => invoke('install', id, mode), cancelInstall: () => invoke('cancelInstall'), installInput: data => invoke('installInput', data), installResize: (cols, rows) => invoke('installResize', cols, rows),
  startService: (id, name) => invoke('startService', id, name), stopService: (id, name) => invoke('stopService', id, name),
  logs: service => invoke('logs', service), openTerminal: () => invoke('openTerminal'),
  openConfigFinder: id => invoke('openConfigFinder', id), openConfigTerminal: id => invoke('openConfigTerminal', id),
  readConfig: id => invoke('readConfig', id), validateConfig: (id, text) => invoke('validateConfig', id, text),
  saveConfig: (id, text, revision) => invoke('saveConfig', id, text, revision),
  checkUpdate: () => invoke('checkUpdate'), installUpdate: () => invoke('installUpdate'),
  onState: callback => subscribe('devenv:state', callback), onLog: callback => subscribe('devenv:log', callback), onInstallOutput: callback => subscribe('devenv:install-output', callback),
};
contextBridge.exposeInMainWorld('devenv', api);
