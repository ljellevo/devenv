import { useEffect, useState } from 'react';
import { Bot, Braces, SquareTerminal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { harnesses } from '../shared/harnesses';
import type { AppState, Harness } from '../shared/types';

const icons: Record<Harness, typeof Bot> = { claude: Bot, codex: Braces, custom: SquareTerminal };

/** One option per coding-agent harness; choosing one saves it immediately, and Custom adds a command field. Settings uses the compact row, onboarding the cards. */
export function HarnessPicker({ state, run, compact, onDirtyChange }: { state: AppState; run(action: () => Promise<unknown>): void; compact?: boolean; onDirtyChange?(dirty: boolean): void }) {
  const current = harnesses.find(harness => harness.value === state.settings.harness)?.value ?? harnesses[0].value;
  const saved = state.settings.harnessCommand ?? '';
  const [command, setCommand] = useState(saved);
  const dirty = current === 'custom' && command.trim() !== saved;
  useEffect(() => { onDirtyChange?.(dirty); }, [dirty]);
  const save = () => run(() => window.devenv.saveSettings({ ...state.settings, harness: 'custom', harnessCommand: command.trim() }));
  const choose = (value: Harness) => run(() => window.devenv.saveSettings({ ...state.settings, harness: value }));
  const field = current === 'custom' && <div className="flex min-w-40 flex-1 gap-2"><Input aria-label="Custom harness command" className="mono" placeholder="gemini" value={command} onChange={event => setCommand(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && dirty) save(); }} /><Button variant="outline" disabled={!dirty} onClick={save}>Save</Button></div>;
  if (compact) return <div className="flex flex-wrap items-center gap-2">
    <div role="group" aria-label="Coding agent" className="inline-flex rounded-lg border bg-muted p-1">{harnesses.map(({ value, label }) => { const OptionIcon = icons[value]; return <Button key={value} size="sm" variant={current === value ? 'secondary' : 'ghost'} aria-pressed={current === value} onClick={() => choose(value)}><OptionIcon />{label}</Button>; })}</div>
    {field}
  </div>;
  return <div className="space-y-2">
    <div role="group" aria-label="Coding agent" className="grid grid-cols-3 gap-2">
      {harnesses.map(({ value, label }) => {
        const selected = current === value, OptionIcon = icons[value];
        return <button key={value} type="button" aria-pressed={selected} onClick={() => choose(value)} className={cn('flex flex-col items-center gap-2 rounded-lg border bg-[var(--surface)] px-3 py-4 text-sm transition-colors hover:bg-[var(--surface-hover)]', selected && 'border-primary ring-1 ring-primary')}><OptionIcon className={cn('size-5', selected ? 'text-primary' : 'text-muted-foreground')} />{label}</button>;
      })}
    </div>
    {field}
  </div>;
}
