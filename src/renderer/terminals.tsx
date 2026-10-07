import { Ghost, SquareTerminal, Terminal } from 'lucide-react';
import { cn } from '@/lib/utils';
import { terminalApps, terminalsFor } from '../shared/terminals';
import type { AppState, TerminalApp } from '../shared/types';

const icons: Record<TerminalApp, typeof Terminal> = { terminal: SquareTerminal, iterm: Terminal, ghostty: Ghost, powershell: Terminal };
export const terminalOptions = terminalApps.map(app => ({ ...app, icon: icons[app.value] }));

/** One card per supported terminal app; choosing a card saves it immediately. */
export function TerminalPicker({ state, run }: { state: AppState; run(action: () => Promise<unknown>): void }) {
  return <div role="group" aria-label="Terminal app" className="grid grid-cols-3 gap-2">
    {terminalsFor(state.hostPlatform).map(app => ({ ...app, icon: icons[app.value] })).map(({ value, label, icon: OptionIcon }) => {
      const selected = state.settings.terminal === value, found = state.installedTerminals.includes(value);
      return <button key={value} type="button" aria-pressed={selected} onClick={() => run(() => window.devenv.saveSettings({ ...state.settings, terminal: value }))} className={cn('flex flex-col items-center gap-2 rounded-lg border bg-[var(--surface)] px-3 py-4 text-sm transition-colors hover:bg-[var(--surface-hover)]', selected && 'border-primary ring-1 ring-primary')}><OptionIcon className={cn('size-5', selected ? 'text-primary' : 'text-muted-foreground')} />{label}{!found && <span className="-mt-1 text-[10px] text-muted-foreground">Not found</span>}</button>;
    })}
  </div>;
}
