import type { TerminalApp } from './types';

export const terminalApps: { value: TerminalApp; label: string; bundle: string }[] = [
  { value: 'terminal', label: 'Terminal', bundle: 'Terminal.app' },
  { value: 'iterm', label: 'iTerm2', bundle: 'iTerm.app' },
  { value: 'ghostty', label: 'Ghostty', bundle: 'Ghostty.app' },
];

export const terminalLabel = (value: TerminalApp) => terminalApps.find(app => app.value === value)?.label ?? 'Terminal';
