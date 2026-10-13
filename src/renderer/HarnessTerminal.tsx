import { useEffect, useRef, useState } from 'react';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import { Bot, ChevronsRight, LoaderCircle, RefreshCw, Settings2, Square } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { cn, shortPath } from '@/lib/utils';
import { customHarnesses, harnesses, harnessCommand, harnessLabel, projectHarness } from '../shared/harnesses';
import type { AppState, Harness, HarnessExit, HarnessOutput, HarnessStatus, Project } from '../shared/types';

const exitNotice = (command: string, code?: number) => `\r\n\x1b[90m[devenv] ${command.split(/\s+/)[0]} exited${code ? ` with code ${code}` : ''}.${code === 127 ? ' Is it installed and on your PATH?' : ''} Choose Restart to run it again.\x1b[0m\r\n`;

const activityLabel: Record<HarnessStatus['state'], string> = { working: 'Working', idle: 'Idle', exited: 'Exited' };
function Activity({ status }: { status?: HarnessStatus }) {
  if (!status) return null;
  return <span className="flex shrink-0 items-center gap-1.5">{status.state === 'working' ? <LoaderCircle className="size-3 animate-spin text-amber-500" /> : <span className={cn('size-1.5 rounded-full', status.state === 'idle' ? 'bg-emerald-500' : 'bg-muted-foreground/50')} />}{activityLabel[status.state]}</span>;
}

/**
 * The project's coding agent in a sheet that slides in from the right. Clicking beside it or Minimize hides it and
 * leaves the harness running behind a pill that shows whether it is working or idle.
 */
export function HarnessTerminal({ project, state, open, onOpenChange, run, onSettings }: { project: Project; state: AppState; open: boolean; onOpenChange(open: boolean): void; run(action: () => Promise<unknown>): void; onSettings(): void }) {
  const host = useRef<HTMLDivElement>(null);
  const sheet = useRef<HTMLElement>(null);
  const terminalRef = useRef<XTerm | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const launch = useRef<(restart: boolean) => void>(() => {});
  const activeRef = useRef(open);
  activeRef.current = open;
  const [opened, setOpened] = useState(false);
  const status = state.harnesses?.[project.id];
  const [error, setError] = useState<string>();
  // A project's own harness overrides the one chosen in Settings.
  const override = state.settings.projectHarnesses?.[project.id];
  const choice = projectHarness(state.settings, project.id);
  const command = harnessCommand(choice), label = harnessLabel(choice);
  // Custom commands join the menu while a project uses them, so another project can pick the same one.
  const customs = customHarnesses(state.settings, state.projects.map(item => item.id));
  const selected = !override ? 'default' : override.harness === 'custom' ? `custom:${harnessCommand(override)}` : override.harness;
  const [asking, setAsking] = useState(false);
  const [draft, setDraft] = useState('');
  const choose = (value: string) => {
    if (value === 'new') { setDraft(override?.harness === 'custom' ? harnessCommand(override) : ''); setAsking(true); return; }
    const projectHarnesses = { ...state.settings.projectHarnesses };
    if (value === 'default') delete projectHarnesses[project.id];
    else projectHarnesses[project.id] = value.startsWith('custom:') ? { harness: 'custom', harnessCommand: value.slice('custom:'.length) } : { harness: value as Harness, harnessCommand: '' };
    run(() => window.devenv.saveSettings({ ...state.settings, projectHarnesses }));
  };
  const useDraft = (event: React.FormEvent) => { event.preventDefault(); if (!draft.trim()) return; setAsking(false); choose(`custom:${draft.trim()}`); };
  // A harness launched before the setting changed keeps running until it is restarted.
  const outdated = status && status.command !== command ? status.command : undefined;
  const directory = project.path.replace(/[\\/][^\\/]*$/, '');
  // A click beside the sheet minimizes it and still reaches what was clicked. Dialogs opened from the sheet are part of it.
  useEffect(() => {
    if (!open) return;
    const minimize = (event: PointerEvent) => { const target = event.target as Element; if (!sheet.current?.contains(target) && !target.closest('[role="dialog"], .dialog-overlay')) onOpenChange(false); };
    document.addEventListener('pointerdown', minimize);
    return () => document.removeEventListener('pointerdown', minimize);
  }, [open, onOpenChange]);
  // Launch when the sheet is first opened, not for every project that is selected.
  useEffect(() => { if (open && command) setOpened(true); }, [open, command]);
  useEffect(() => {
    if (!opened || !host.current) return;
    const terminal = new XTerm({ cursorBlink: true, fontFamily: 'SFMono-Regular, Menlo, monospace', fontSize: 12, theme: { background: '#282C34', foreground: '#D8DEE9', cursor: '#88C0D0', selectionBackground: '#4C566A' }, scrollback: 5000 });
    const fit = new FitAddon(); terminal.loadAddon(fit); terminal.open(host.current);
    // FitAddon subtracts padding on .xterm, but not padding on its parent.
    if (terminal.element) terminal.element.style.padding = '12px';
    terminalRef.current = terminal; fitRef.current = fit;
    // Events can overtake the snapshot they belong to, so they wait until it arrives and are matched by run and offset.
    let run: number | undefined, offset = 0, attempts = 0, disposed = false, launched = '';
    let pending: Array<HarnessOutput | HarnessExit> = [];
    const apply = (event: HarnessOutput | HarnessExit) => {
      if (event.run !== run) return;
      if ('data' in event) { if (event.offset >= offset) terminal.write(event.data); return; }
      terminal.write(exitNotice(launched, event.exitCode));
    };
    const receive = (event: HarnessOutput | HarnessExit) => { if (event.id !== project.id) return; if (run === undefined) pending.push(event); else apply(event); };
    const offOutput = window.devenv.onHarnessOutput(receive), offExit = window.devenv.onHarnessExit(receive);
    const resize = () => { try { fit.fit(); void window.devenv.harnessResize(project.id, terminal.cols, terminal.rows).catch(() => {}); } catch { /* tab may be hidden */ } };
    launch.current = restart => {
      const attempt = ++attempts;
      run = undefined; pending = []; setError(undefined);
      try { fit.fit(); } catch { /* tab may be hidden */ }
      void window.devenv.harnessOpen(project.id, terminal.cols, terminal.rows, restart).then(snapshot => {
        if (disposed || attempt !== attempts) return;
        terminal.reset(); terminal.write(snapshot.output);
        run = snapshot.run; offset = snapshot.offset; launched = snapshot.command;
        if (snapshot.running) resize(); else terminal.write(exitNotice(snapshot.command, snapshot.exitCode));
        for (const event of pending.splice(0)) apply(event);
        if (activeRef.current) terminal.focus();
      }).catch(cause => { if (!disposed && attempt === attempts) setError((cause instanceof Error ? cause.message : String(cause)).replace(/^Error invoking remote method '[^']*': (?:Error: )?/, '')); });
    };
    const input = terminal.onData(data => { void window.devenv.harnessInput(project.id, data).catch(() => {}); });
    const observer = new ResizeObserver(() => { if (activeRef.current) resize(); });
    observer.observe(host.current);
    launch.current(false);
    return () => { disposed = true; launch.current = () => {}; observer.disconnect(); input.dispose(); offOutput(); offExit(); terminal.dispose(); terminalRef.current = null; fitRef.current = null; };
  }, [opened, project.id]);
  useEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(() => {
      const terminal = terminalRef.current;
      if (!terminal) return;
      try { fitRef.current?.fit(); void window.devenv.harnessResize(project.id, terminal.cols, terminal.rows).catch(() => {}); terminal.focus(); } catch { /* tab may have become hidden */ }
    });
    return () => cancelAnimationFrame(frame);
  }, [open, opened, project.id]);
  // ⌘K opens the command menu on macOS, so Ctrl+K stays with the terminal there.
  const keepControlK = (event: React.KeyboardEvent) => { if (state.hostPlatform === 'macos' && event.ctrlKey && !event.metaKey && event.key.toLowerCase() === 'k') event.stopPropagation(); };
  const title = outdated ?? label;
  const action = 'px-2 text-muted-foreground';
  return <>
    {!open && <button type="button" title={`Open the ${title} terminal (Space)`} onClick={() => onOpenChange(true)} className="fixed bottom-11 right-7 z-30 flex items-center gap-2.5 rounded-full border bg-[var(--dialog)] py-2 pl-3 pr-4 text-xs shadow-[0_0_30px_-5px_rgb(0_0_0/0.3)] transition-colors hover:bg-[var(--surface-hover)]"><Bot className="size-4 text-primary" /><span className="font-medium">{title}</span><span className="text-muted-foreground"><Activity status={status} /></span></button>}
    {/* Wide, because the agent is the focus while it is open. Starts below the window header so Run project and the command menu stay reachable. */}
    <aside ref={sheet} aria-label={`${title} terminal`} inert={!open} className={cn('fixed bottom-0 right-2 top-14 z-30 flex w-[78vw] flex-col overflow-hidden rounded-t-2xl border border-b-0 bg-[var(--dialog)] shadow-[0_0_50px_-5px_rgb(0_0_0/0.25)] transition-transform duration-300 ease-in-out', !open && 'translate-x-[calc(100%+1.5rem)]')}>
      <div className="flex shrink-0 items-center gap-2 border-b px-4 py-3">
        <div className="min-w-0 flex-1"><h2 className="truncate text-sm font-medium">{title}</h2><p className="flex items-center gap-1.5 text-xs text-muted-foreground"><Activity status={status} />{status && <span>·</span>}<span className="mono min-w-0 truncate text-[11px]" title={directory}>{shortPath(directory)}</span></p></div>
        <select aria-label="Harness for this project" title="Harness for this project" value={selected} onChange={event => choose(event.target.value)} className="h-8 max-w-56 shrink-0 truncate rounded-md border bg-[var(--surface)] px-2 text-xs"><option value="default">Default · {harnessLabel(state.settings)}</option>{harnesses.filter(harness => harness.value !== 'custom').map(({ value, label }) => <option key={value} value={value}>{label}</option>)}{customs.map(custom => <option key={custom} value={`custom:${custom}`}>{custom}</option>)}<option value="new">Custom command…</option></select>
        {outdated && command ? <Button variant="outline" size="sm" title={`Stop ${outdated} and start ${label}`} onClick={() => launch.current(true)}><RefreshCw />Restart with {label}</Button>
          : <Button variant="ghost" size="sm" className={action} disabled={!opened || !command} title={`Start ${label} again in a fresh terminal`} onClick={() => launch.current(true)}><RefreshCw />Restart</Button>}
        <Button variant="ghost" size="sm" className={action} disabled={!status || status.state === 'exited'} title="Stop the harness" onClick={() => void window.devenv.harnessClose(project.id).catch(() => {})}><Square />Stop</Button>
        <Button variant="ghost" size="sm" className={action} title="Minimize. The harness keeps running." onClick={() => onOpenChange(false)}><ChevronsRight />Minimize</Button>
      </div>
      {error && <p role="alert" className="shrink-0 border-b px-4 py-2 text-xs text-destructive">{error}</p>}
      <div className="terminal-panel flex min-h-0 flex-1 flex-col bg-[#282C34] text-[var(--terminal-foreground)]">
        {!opened && <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center text-[11px] text-[#7F8A99]">{command ? <span>› {label} starts here when you open this sheet.</span> : override ? <span>Choose a harness for this project to use this terminal.</span> : <><span>Enter the command for your custom harness to use this terminal.</span><button className="flex items-center gap-1.5 text-[var(--terminal-foreground)] hover:text-white" onClick={onSettings}><Settings2 className="size-3" />Open Settings</button></>}</div>}
        <div ref={host} onKeyDown={keepControlK} className={cn('harness-terminal min-h-0 w-full flex-1 overflow-hidden bg-[#282C34]', !opened && 'hidden')} aria-label="Coding agent terminal" />
      </div>
    </aside>
    <Dialog open={asking} onOpenChange={setAsking}><DialogContent className="max-w-md"><form className="grid gap-5" onSubmit={useDraft}>
      <div><DialogTitle>Custom harness</DialogTitle><DialogDescription className="mt-2">Enter the command that starts your coding agent. It runs through your shell in this project’s folder, and stays in the harness menu while a project uses it.</DialogDescription></div>
      <Input autoFocus aria-label="Harness command" className="mono" placeholder="gemini" value={draft} onChange={event => setDraft(event.target.value)} onFocus={event => event.currentTarget.select()} />
      <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setAsking(false)}>Cancel</Button><Button type="submit" disabled={!draft.trim()}>Use command</Button></div>
    </form></DialogContent></Dialog>
  </>;
}
