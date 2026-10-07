import type { TerminalApp } from './types';
import type { Platform } from './platform';
export const terminalApps: { value: TerminalApp; label: string; bundle: string }[] = [
  { value: 'terminal', label: 'Terminal', bundle: 'Terminal.app' },
  { value: 'iterm', label: 'iTerm2', bundle: 'iTerm.app' },
  { value: 'ghostty', label: 'Ghostty', bundle: 'Ghostty.app' },
  { value: 'powershell', label: 'PowerShell', bundle: '' },
];
export const terminalsFor = (host: Platform) => terminalApps.filter(app => host === 'macos' ? app.value !== 'powershell' : host === 'windows' ? ['terminal', 'powershell'].includes(app.value) : ['terminal', 'ghostty'].includes(app.value)).map(app => ({ ...app, label: terminalLabel(app.value, host) }));
export const terminalLabel = (value: TerminalApp, host: Platform = 'macos') => value === 'terminal' ? (host === 'windows' ? 'Windows Terminal' : host === 'linux' ? 'System Terminal' : 'Terminal') : terminalApps.find(app => app.value === value)?.label ?? 'Terminal';
