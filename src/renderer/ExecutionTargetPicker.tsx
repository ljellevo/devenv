import { useState } from 'react';
import type { AppState, Project } from '../shared/types';
export function ExecutionTargetPicker({ state, project, run, onSelect }: { state: AppState; project: Project; onSelect(id: string): void; run(action: () => Promise<unknown>): void }) {
  const [distributions, setDistributions] = useState<Array<{ name: string; version: number }>>([]);
  const busy = state.installState?.status === 'running' || !!state.session && !['stopped', 'failed'].includes(state.session.status);
  const target = project.executionTarget;
  if (state.hostPlatform !== 'windows') return null;
  return <label className="text-xs text-muted-foreground">Execution environment <select aria-label="Execution environment" className="ml-2 rounded border bg-background p-1" disabled={busy || target?.kind === 'wsl' && !project.executionSourcePath} value={target?.kind === 'wsl' ? target.distribution : ''} onFocus={() => run(async () => setDistributions(await window.devenv.wslDistributions()))} onChange={event => { const target = event.target.value; run(async () => onSelect(await window.devenv.setProjectTarget(project.id, target ? { kind: 'wsl', distribution: target } : { kind: 'native' }))); }}><option value="">Native Windows</option>{target?.kind === 'wsl' && !distributions.some(item => item.name === target.distribution) && <option value={target.distribution}>{target.distribution}</option>}{distributions.map(item => <option key={item.name} value={item.name} disabled={item.version !== 2}>{item.name} · WSL {item.version}</option>)}</select></label>;
}
