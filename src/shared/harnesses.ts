import type { Harness, HarnessChoice, Settings } from './types';
export const harnesses: { value: Harness; label: string; command: string }[] = [
  { value: 'claude', label: 'Claude Code', command: 'claude' },
  { value: 'codex', label: 'Codex', command: 'codex' },
  { value: 'custom', label: 'Custom', command: '' },
];
type HarnessSettings = Partial<HarnessChoice>;
const preset = (settings: HarnessSettings) => harnesses.find(harness => harness.value === settings.harness) ?? harnesses[0];
/** The command the Terminal tab runs; empty until a custom harness has a command. */
export const harnessCommand = (settings: HarnessSettings = {}) => preset(settings).value === 'custom' ? (settings.harnessCommand ?? '').trim() : preset(settings).command;
export const harnessLabel = (settings: HarnessSettings) => preset(settings).value === 'custom' ? harnessCommand(settings).split(/\s+/)[0] || 'Custom harness' : preset(settings).label;
/** A project's own harness when it has one, otherwise the one chosen in Settings. */
export const projectHarness = (settings: Partial<Settings>, projectId: string): HarnessSettings => settings.projectHarnesses?.[projectId] ?? settings;
/** Custom commands still in use: the one from Settings and those chosen by a known project. An unused one drops out of the list. */
export const customHarnesses = (settings: Partial<Settings>, projectIds: string[]): string[] => {
  const choices: Array<HarnessSettings | undefined> = [settings, ...projectIds.map(id => settings.projectHarnesses?.[id])];
  return [...new Set(choices.filter(choice => choice?.harness === 'custom').map(harnessCommand).filter(Boolean))].sort((a, b) => a.localeCompare(b));
};
