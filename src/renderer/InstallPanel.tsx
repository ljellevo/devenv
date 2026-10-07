import { useState } from 'react';
import { Circle, CircleCheck, CircleMinus, CircleX, ListChecks, LoaderCircle, SquareTerminal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { InstallTerminal } from './InstallTerminal';
import type { InstallConfig, InstallState, Project } from '../shared/types';

type StepStatus = 'pending' | 'running' | 'done' | 'failed' | 'cancelled';

const statusLabel: Record<InstallState['status'], string> = { running: 'Installing', completed: 'Installed', failed: 'Failed', cancelled: 'Cancelled' };

function StepIcon({ status }: { status: StepStatus }) {
  if (status === 'running') return <LoaderCircle className="size-4 animate-spin text-primary" aria-label="Running" />;
  if (status === 'done') return <CircleCheck className="size-4 text-emerald-600" aria-label="Done" />;
  if (status === 'failed') return <CircleX className="size-4 text-destructive" aria-label="Failed" />;
  if (status === 'cancelled') return <CircleMinus className="size-4 text-muted-foreground" aria-label="Cancelled" />;
  return <Circle className="size-4 text-muted-foreground/50" aria-label="Pending" />;
}

export function InstallPanel({ project, install, installState, output, active, onInstall }: { project: Project; install: InstallConfig; installState: InstallState | null; output: string; active: boolean; onInstall: (mode: 'resume' | 'restart') => void }) {
  const [showTerminal, setShowTerminal] = useState(false);
  const steps = install.steps;
  const current = installState?.projectId === project.id ? installState : null;
  const installing = current?.status === 'running';
  const completed = new Set(current ? current.completedStepIds : project.installed ? steps.map(step => step.id) : []);
  const stepStatus = (id: string): StepStatus => {
    if (completed.has(id)) return 'done';
    if (current?.stepId !== id) return 'pending';
    return current.status === 'running' ? 'running' : current.status === 'failed' ? 'failed' : current.status === 'cancelled' ? 'cancelled' : 'pending';
  };
  const waitingForInput = installing && steps.find(step => step.id === current.stepId)?.interactive;
  return <>
    <div className="mb-2 flex items-center justify-between gap-3 rounded-lg border bg-[var(--surface)] px-4 py-3 text-xs">
      <div className="min-w-0"><strong>{current ? statusLabel[current.status] : project.installed ? 'Installed' : 'Not installed'}</strong><span className="ml-2 text-muted-foreground">{completed.size}/{steps.length} steps done</span></div>
      <Button size="sm" variant="outline" className="shrink-0" onClick={() => setShowTerminal(open => !open)}>{showTerminal ? <><ListChecks />Show steps</> : <><SquareTerminal />Show terminal</>}</Button>
    </div>
    {current?.status === 'failed' && <div className="mb-2 rounded-lg border border-red-300 bg-red-50 p-3 text-xs text-red-900"><p>{current.error}</p><div className="mt-2 flex gap-2">{current.completedStepIds.length < steps.length && <Button size="sm" onClick={() => onInstall('resume')}>Retry failed step</Button>}<Button size="sm" variant="outline" onClick={() => onInstall('restart')}>Restart all steps</Button></div></div>}
    {!showTerminal && <ol className="min-h-0 flex-1 overflow-y-auto rounded-lg border bg-[var(--surface)]" aria-label="Installation steps">
      {steps.map((step, index) => {
        const status = stepStatus(step.id);
        return <li key={step.id} className={cn('flex items-start gap-3 border-b px-4 py-3 text-xs last:border-b-0', status === 'running' && 'bg-primary/5')}>
          <span className="mt-px shrink-0"><StepIcon status={status} /></span>
          <div className="min-w-0 flex-1">
            <p className={cn('font-medium', status === 'pending' && 'text-muted-foreground')}><span className="mr-1.5 text-muted-foreground">{index + 1}.</span>{step.id}</p>
            <code className="mt-0.5 block truncate font-mono text-[11px] text-muted-foreground" title={step.command}>{step.command}</code>
            {step.notes && status !== 'done' && <p className="mt-1.5 text-muted-foreground">{step.notes}</p>}
            {status === 'running' && waitingForInput && <button className="mt-1.5 text-primary hover:underline" onClick={() => setShowTerminal(true)}>This step may ask for input. Open the terminal</button>}
          </div>
        </li>;
      })}
    </ol>}
    {/* Kept mounted while hidden so the output survives switching views. */}
    <div className={cn('min-h-0 flex-1 overflow-hidden rounded-lg border border-[#404651]', !showTerminal && 'hidden')}><InstallTerminal active={active && showTerminal && installing} output={current ? output : ''} /></div>
  </>;
}
