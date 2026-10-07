import { useState, type ReactNode } from 'react';
import { ArrowLeftRight, ArrowLeft, ArrowRight, Check, FileCode2, FilePlus2, FolderPlus, FolderSearch, Palette, Play, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { appearanceOptions } from './appearance';
import type { AppState } from '../shared/types';

const kbd = (key: string) => <kbd className="rounded border px-1.5 py-0.5 text-[10px]">{key}</kbd>;
const toml = (name: string) => <span className="mono text-xs">{name}</span>;
const steps: { kind: 'info' | 'appearance' | 'folders' | 'project'; icon: typeof Play; title: string; body: ReactNode }[] = [
  { kind: 'info', icon: ArrowLeftRight, title: 'Welcome to Devenv', body: <><p>Devenv starts, stops, and switches your local development projects from one place.</p><p>One project session is active at a time. Switching to another project stops the current one first, so ports and processes never collide.</p></> },
  { kind: 'appearance', icon: Palette, title: 'Light or dark?', body: <p>Pick how Devenv looks. <strong>System</strong> follows your Mac’s appearance and switches with it. You can change this in Settings at any time.</p> },
  { kind: 'info', icon: Play, title: 'Run, watch, and switch', body: <ul className="list-disc space-y-2 pl-5"><li><strong>Run project</strong> starts every enabled service in dependency order.</li><li>The <strong>Terminal</strong> tab streams service output; <strong>Config</strong> edits the TOML in place.</li><li>Press {kbd('⌘ K')} to search projects and commands.</li></ul> },
  { kind: 'info', icon: FileCode2, title: 'One small file per project', body: <><p>One {toml('devenv.toml')} describes all the services in a project and how they depend on each other. Optionally, it also describes how to install the project, so setting up and switching projects stays quick.</p><pre className="mono rounded-lg border bg-[var(--surface)] px-4 py-3 text-[11px] leading-5 text-muted-foreground">{'[services.db]\ncommand = "docker compose up postgres"\n\n[services.api]\ncommand = "npm run dev"\ndepends_on = ["db"]\n\n[[install.steps]]\nid = "dependencies"\ncommand = "npm install"'}</pre></> },
  { kind: 'folders', icon: FolderSearch, title: 'Where are your projects?', body: <p>Choose the folder that <strong>contains</strong> your projects. Devenv looks for {toml('devenv.toml')} in its subfolders and skips dependency, cache, and build folders. You can add more folders in Settings at any time.</p> },
  { kind: 'project', icon: FilePlus2, title: 'Want to add a project?', body: <><p>Have a project without a {toml('devenv.toml')} yet? Choose <strong>that project’s own folder</strong>, not the folder that contains all your projects.</p><p>Devenv creates an empty {toml('devenv.toml')} there and gives you a prompt to paste into a coding agent, which fills it out for you.</p></> },
];

export function Onboarding({ state, open, onDone, onAddProject, run }: { state: AppState; open: boolean; onDone(): void; onAddProject(): void; run(action: () => Promise<unknown>): void }) {
  const [index, setIndex] = useState(0);
  const step = steps[index], Icon = step.icon;
  const roots = state.settings.roots;
  const next = () => setIndex(index + 1);
  return <Dialog open={open} onOpenChange={value => { if (!value) onDone(); }}><DialogContent className="max-w-[560px] gap-6 p-7" onInteractOutside={event => event.preventDefault()}>
    <div className="pr-8">
      <div className="mb-5 flex size-11 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm"><Icon className="size-5" /></div>
      <p className="mb-2 text-[10px] font-semibold uppercase tracking-[.16em] text-muted-foreground">Step {index + 1} of {steps.length}</p>
      <DialogTitle className="text-xl">{step.title}</DialogTitle>
      <DialogDescription asChild><div className="mt-4 space-y-3 leading-6">{step.body}</div></DialogDescription>
    </div>
    {step.kind === 'appearance' && <div role="group" aria-label="Appearance" className="grid grid-cols-3 gap-2">
      {appearanceOptions.map(({ value, label, icon: OptionIcon }) => { const selected = state.settings.appearance === value; return <button key={value} type="button" aria-pressed={selected} onClick={() => run(() => window.devenv.saveSettings({ ...state.settings, appearance: value }))} className={cn('flex flex-col items-center gap-2 rounded-lg border bg-[var(--surface)] px-3 py-4 text-sm transition-colors hover:bg-[var(--surface-hover)]', selected && 'border-primary ring-1 ring-primary')}><OptionIcon className={cn('size-5', selected ? 'text-primary' : 'text-muted-foreground')} />{label}</button>; })}
    </div>}
    {step.kind === 'folders' && <section aria-label="Search folders" className="space-y-2">
      {roots.map(root => <div key={root} className="flex items-center gap-2 rounded-md border bg-[var(--surface)] py-1 pl-3 pr-1" title={root}><Check className="size-3.5 shrink-0 text-primary" /><span className="mono flex-1 truncate text-xs">{root}</span><Button size="icon" variant="ghost" className="size-8" aria-label={`Remove ${root}`} onClick={() => run(() => window.devenv.saveSettings({ ...state.settings, roots: roots.filter(r => r !== root) }))}><Trash2 /></Button></div>)}
      <Button variant={roots.length ? 'outline' : 'default'} onClick={() => run(() => window.devenv.addFolder())}><FolderPlus />{roots.length ? 'Add another folder' : 'Choose folder'}</Button>
    </section>}
    {step.kind === 'project' && <div><Button variant="outline" onClick={onAddProject}><FilePlus2 />Add a project</Button></div>}
    <div className="flex items-center gap-3">
      <div className="flex gap-1.5" aria-hidden="true">{steps.map((_, i) => <span key={i} className={cn('h-1.5 rounded-full transition-all', i === index ? 'w-5 bg-primary' : 'w-1.5 bg-muted-foreground/30')} />)}</div>
      <div className="ml-auto flex gap-2">
        {index === 0 ? <Button variant="ghost" onClick={onDone}>Skip tutorial</Button> : <Button variant="ghost" onClick={() => setIndex(index - 1)}><ArrowLeft />Back</Button>}
        {step.kind === 'folders' && !roots.length && <Button variant="outline" onClick={next}>Skip for now</Button>}
        {step.kind === 'project' ? <Button onClick={onDone}><Check />Finish</Button>
          : <Button disabled={step.kind === 'folders' && !roots.length} onClick={next}>Next<ArrowRight /></Button>}
      </div>
    </div>
  </DialogContent></Dialog>;
}
