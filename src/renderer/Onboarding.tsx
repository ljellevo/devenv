import { useState, type ReactNode } from 'react';
import { ArrowLeftRight, ArrowLeft, ArrowRight, Check, FileCode2, FolderPlus, FolderSearch, Play } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import type { AppState } from '../shared/types';

const kbd = (key: string) => <kbd className="rounded border px-1.5 py-0.5 text-[10px]">{key}</kbd>;
const steps: { icon: typeof Play; title: string; body: ReactNode }[] = [
  { icon: ArrowLeftRight, title: 'Welcome to Devenv', body: <><p>Devenv starts, stops, and switches your local development projects from one place.</p><p>One project session is active at a time. Switching to another project stops the current one first, so ports and processes never collide.</p></> },
  { icon: FileCode2, title: 'One small file per project', body: <><p>Each project has a <span className="mono text-xs">devenv.toml</span> listing its services and the shell commands that run them.</p><pre className="mono rounded-lg border bg-[var(--surface)] px-4 py-3 text-[11px] leading-5 text-muted-foreground">{'version = 1\nname = "My project"\n\n[services.api]\ncwd = "./api"\ncommand = "npm run dev"\nports = [3100]'}</pre><p>No file yet? Choose <strong>Add a project</strong> from {kbd('⌘ K')} later and Devenv creates one for you.</p></> },
  { icon: Play, title: 'Run, watch, and switch', body: <ul className="list-disc space-y-2 pl-5"><li><strong>Run project</strong> starts every enabled service in dependency order.</li><li>The <strong>Terminal</strong> tab streams service output; <strong>Config</strong> edits the TOML in place.</li><li>Move the pointer to the left edge of the window to open the project sidebar.</li><li>Press {kbd('⌘ K')} to search projects and commands.</li></ul> },
  { icon: FolderSearch, title: 'Where are your projects?', body: <p>Choose the folder that contains your projects. Devenv looks for <span className="mono text-xs">devenv.toml</span> in its subfolders and skips dependency, cache, and build folders. You can add more folders in Settings at any time.</p> },
];

export function Onboarding({ state, open, onDone, run }: { state: AppState; open: boolean; onDone(): void; run(action: () => Promise<unknown>): void }) {
  const [index, setIndex] = useState(0);
  const step = steps[index], Icon = step.icon;
  const last = index === steps.length - 1;
  const roots = state.settings.roots;
  return <Dialog open={open} onOpenChange={value => { if (!value) onDone(); }}><DialogContent aria-label="Devenv tutorial" className="max-w-[560px] gap-6 p-7" onInteractOutside={event => event.preventDefault()}>
    <div className="pr-8">
      <div className="mb-5 flex size-11 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm"><Icon className="size-5" /></div>
      <p className="mb-2 text-[10px] font-semibold uppercase tracking-[.16em] text-muted-foreground">Step {index + 1} of {steps.length}</p>
      <DialogTitle className="text-xl">{step.title}</DialogTitle>
      <DialogDescription asChild><div className="mt-4 space-y-3 leading-6">{step.body}</div></DialogDescription>
    </div>
    {last && <section aria-label="Search folders" className="space-y-2">
      {roots.map(root => <div key={root} className="mono flex items-center gap-2 truncate rounded-md border bg-[var(--surface)] px-3 py-2 text-xs" title={root}><Check className="size-3.5 shrink-0 text-primary" /><span className="truncate">{root}</span></div>)}
      <Button variant={roots.length ? 'outline' : 'default'} onClick={() => run(() => window.devenv.addFolder())}><FolderPlus />{roots.length ? 'Add another folder' : 'Choose folder'}</Button>
    </section>}
    <div className="flex items-center gap-3">
      <div className="flex gap-1.5" aria-hidden="true">{steps.map((_, i) => <span key={i} className={cn('h-1.5 rounded-full transition-all', i === index ? 'w-5 bg-primary' : 'w-1.5 bg-muted-foreground/30')} />)}</div>
      <div className="ml-auto flex gap-2">
        {index === 0 ? <Button variant="ghost" onClick={onDone}>Skip tutorial</Button> : <Button variant="ghost" onClick={() => setIndex(index - 1)}><ArrowLeft />Back</Button>}
        {last && !roots.length && <Button variant="outline" onClick={onDone}>Skip for now</Button>}
        {last ? <Button disabled={!roots.length} onClick={onDone}><Check />Finish</Button> : <Button onClick={() => setIndex(index + 1)}>Next<ArrowRight /></Button>}
      </div>
    </div>
  </DialogContent></Dialog>;
}
