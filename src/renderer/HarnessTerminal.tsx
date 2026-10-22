import { useEffect, useReducer, useRef, useState } from 'react';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import { Bot, ChevronsRight, LoaderCircle, Pencil, Plus, RefreshCw, Settings2, Square, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { cn, shortPath } from '@/lib/utils';
import { customHarnesses, harnesses, harnessCommand, harnessKey, harnessKeys, harnessLabel, harnessTab, newTabShortcut, projectHarness } from '../shared/harnesses';
import type { AppState, Harness, HarnessExit, HarnessOutput, HarnessStatus, Project } from '../shared/types';

const exitNotice = (command: string, code?: number) => `\r\n\x1b[90m[devenv] ${command.split(/\s+/)[0]} exited${code ? ` with code ${code}` : ''}.${code === 127 ? ' Is it installed and on your PATH?' : ''} Choose Restart to run it again.\x1b[0m\r\n`;

const activityLabel: Record<HarnessStatus['state'], string> = { working: 'Working', idle: 'Idle', exited: 'Exited' };
function Activity({ status }: { status?: HarnessStatus }) {
  if (!status) return null;
  return <span className="flex shrink-0 items-center gap-1.5">{status.state === 'working' ? <LoaderCircle className="size-3 animate-spin text-amber-500" /> : <span className={cn('size-1.5 rounded-full', status.state === 'idle' ? 'bg-emerald-500' : 'bg-muted-foreground/50')} />}{activityLabel[status.state]}</span>;
}

/** One tab's harness in its own xterm. It launches, or attaches to, the harness when it mounts. */
function HarnessTab({ id, visible, host: hostPlatform, launches }: { id: string; visible: boolean; host: AppState['hostPlatform']; launches: Map<string, (restart: boolean) => void> }) {
  const host = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<XTerm | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const activeRef = useRef(visible);
  activeRef.current = visible;
  const [error, setError] = useState<string>();
  useEffect(() => {
    if (!host.current) return;
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
    const receive = (event: HarnessOutput | HarnessExit) => { if (event.id !== id) return; if (run === undefined) pending.push(event); else apply(event); };
    const offOutput = window.devenv.onHarnessOutput(receive), offExit = window.devenv.onHarnessExit(receive);
    const resize = () => { try { fit.fit(); void window.devenv.harnessResize(id, terminal.cols, terminal.rows).catch(() => {}); } catch { /* tab may be hidden */ } };
    const launch = (restart: boolean) => {
      const attempt = ++attempts;
      run = undefined; pending = []; setError(undefined);
      try { fit.fit(); } catch { /* tab may be hidden */ }
      void window.devenv.harnessOpen(id, terminal.cols, terminal.rows, restart).then(snapshot => {
        if (disposed || attempt !== attempts) return;
        terminal.reset(); terminal.write(snapshot.output);
        run = snapshot.run; offset = snapshot.offset; launched = snapshot.command;
        if (snapshot.running) resize(); else terminal.write(exitNotice(snapshot.command, snapshot.exitCode));
        for (const event of pending.splice(0)) apply(event);
        if (activeRef.current) terminal.focus();
      }).catch(cause => { if (!disposed && attempt === attempts) setError((cause instanceof Error ? cause.message : String(cause)).replace(/^Error invoking remote method '[^']*': (?:Error: )?/, '')); });
    };
    launches.set(id, launch);
    const input = terminal.onData(data => { void window.devenv.harnessInput(id, data).catch(() => {}); });
    // xterm sends Shift+Enter as Enter and has nothing for the ⌘ line keys. The key is cancelled so it is not also typed.
    // The new-tab shortcut is left for the sheet.
    terminal.attachCustomKeyEventHandler(event => {
      if (newTabShortcut(event, hostPlatform)) return false;
      const keys = harnessKeys(event, hostPlatform);
      if (keys === undefined) return true;
      if (event.type === 'keydown') { event.preventDefault(); terminal.input(keys); }
      return false;
    });
    const observer = new ResizeObserver(() => { if (activeRef.current) resize(); });
    observer.observe(host.current);
    launch(false);
    return () => { disposed = true; if (launches.get(id) === launch) launches.delete(id); observer.disconnect(); input.dispose(); offOutput(); offExit(); terminal.dispose(); terminalRef.current = null; fitRef.current = null; };
  }, [id]);
  // An agent that draws a full-screen interface repaints only what changed, so a terminal that was hidden or replayed from a
  // snapshot can be left with just its latest updates, such as the status line. Shrinking the terminal by a row and restoring
  // it makes the agent redraw the whole screen.
  useEffect(() => {
    if (!visible) return;
    const frame = requestAnimationFrame(() => {
      const terminal = terminalRef.current;
      if (!terminal) return;
      try {
        fitRef.current?.fit(); terminal.refresh(0, terminal.rows - 1); terminal.focus();
        const { cols, rows } = terminal;
        void (rows > 1 ? window.devenv.harnessResize(id, cols, rows - 1) : Promise.resolve()).then(() => window.devenv.harnessResize(id, cols, rows)).catch(() => {});
      } catch { /* tab may have become hidden */ }
    });
    return () => cancelAnimationFrame(frame);
  }, [visible, id]);
  // ⌘K opens the command menu on macOS, so Ctrl+K stays with the terminal there.
  const keepControlK = (event: React.KeyboardEvent) => { if (hostPlatform === 'macos' && event.ctrlKey && !event.metaKey && event.key.toLowerCase() === 'k') event.stopPropagation(); };
  return <>
    {error && <p role="alert" className="shrink-0 border-b border-white/8 px-4 py-2 text-xs text-destructive">{error}</p>}
    <div ref={host} onKeyDown={keepControlK} className="harness-terminal min-h-0 w-full flex-1 overflow-hidden bg-[#282C34]" aria-label={visible ? 'Coding agent terminal' : undefined} />
  </>;
}

const busiest: HarnessStatus['state'][] = ['working', 'idle', 'exited'];
// The selected tab of each project, kept while the sheet shows another project.
const selectedTabs = new Map<string, number>();
const tabColors = [
  { label: 'Red', value: '#EF4444' }, { label: 'Orange', value: '#F97316' }, { label: 'Yellow', value: '#EAB308' }, { label: 'Green', value: '#22C55E' },
  { label: 'Teal', value: '#14B8A6' }, { label: 'Blue', value: '#3B82F6' }, { label: 'Purple', value: '#A855F7' }, { label: 'Pink', value: '#EC4899' },
];
// The name and color given to each tab, by harness key. They last as long as the app, like the harnesses themselves.
const tabLooks = new Map<string, { name?: string; color?: string }>();
const presetLabel = (command: string) => harnesses.find(harness => harness.command && harness.command === command)?.label ?? command.split(/\s+/)[0];

/**
 * The project's coding agents in a sheet that slides in from the right, one tab per harness. Clicking beside it or
 * Minimize hides it and leaves the harnesses running behind a pill that shows whether any of them is working.
 */
export function HarnessTerminal({ project, state, open, onOpenChange, run, onSettings }: { project: Project; state: AppState; open: boolean; onOpenChange(open: boolean): void; run(action: () => Promise<unknown>): void; onSettings(): void }) {
  const sheet = useRef<HTMLElement>(null);
  const launches = useRef(new Map<string, (restart: boolean) => void>()).current;
  // Tabs whose harness is still known to the app survive switching projects; a project without any starts with one.
  const [tabs, setTabs] = useState(() => { const known = Object.keys(state.harnesses ?? {}).map(key => harnessTab(key, project.id)).filter((tab): tab is number => tab !== undefined).sort((a, b) => a - b); return known.length ? known : [1]; });
  const [selectedTab, setSelectedTab] = useState(() => selectedTabs.get(project.id) ?? 1);
  const current = tabs.includes(selectedTab) ? selectedTab : tabs[0];
  const select = (tab: number) => { selectedTabs.set(project.id, tab); setSelectedTab(tab); };
  const [, lookChanged] = useReducer((count: number) => count + 1, 0);
  const lookOf = (tab: number) => tabLooks.get(harnessKey(project.id, tab)) ?? {};
  const setLook = (tab: number, look: { name?: string; color?: string }) => { tabLooks.set(harnessKey(project.id, tab), { ...lookOf(tab), ...look }); lookChanged(); };
  // Right-clicking a tab opens its menu for renaming and color, positioned within the sheet.
  const [menu, setMenu] = useState<{ tab: number; left: number; top: number }>();
  const [renaming, setRenaming] = useState<number>();
  const cancelRename = useRef(false);
  const openMenu = (tab: number, event: React.MouseEvent) => { event.preventDefault(); const box = sheet.current!.getBoundingClientRect(); setMenu({ tab, left: Math.min(event.clientX - box.left, box.width - 184), top: event.clientY - box.top }); };
  useEffect(() => {
    if (!menu) return;
    const close = (event: Event) => { if (event instanceof KeyboardEvent ? event.key === 'Escape' : !(event.target as Element).closest('[role="menu"]')) setMenu(undefined); };
    document.addEventListener('pointerdown', close); document.addEventListener('keydown', close);
    return () => { document.removeEventListener('pointerdown', close); document.removeEventListener('keydown', close); };
  }, [menu]);
  const [opened, setOpened] = useState(false);
  const statusOf = (tab: number) => state.harnesses?.[harnessKey(project.id, tab)];
  const status = statusOf(current);
  const projectStatus = tabs.map(statusOf).filter(Boolean).sort((a, b) => busiest.indexOf(a!.state) - busiest.indexOf(b!.state))[0];
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
  const launchCurrent = (restart: boolean) => launches.get(harnessKey(project.id, current))?.(restart);
  // A new tab starts its harness right away. Before the sheet has started any, it opens the sheet, which starts the first.
  const addTab = () => {
    onOpenChange(true);
    if (!opened || !command) return;
    const tab = Math.max(...tabs) + 1;
    setTabs([...tabs, tab]); select(tab);
  };
  const closeTab = (tab: number) => {
    tabLooks.delete(harnessKey(project.id, tab));
    void window.devenv.harnessClose(harnessKey(project.id, tab), true).catch(() => {});
    const rest = tabs.filter(item => item !== tab);
    // Closing the last tab minimizes the sheet; it starts a fresh harness the next time it opens.
    if (!rest.length) { setTabs([1]); select(1); setOpened(false); onOpenChange(false); return; }
    if (tab === current) select(rest[Math.max(0, tabs.indexOf(tab) - 1)]);
    setTabs(rest);
  };
  const addTabRef = useRef(addTab);
  addTabRef.current = addTab;
  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      if (!newTabShortcut(event, state.hostPlatform) || (event.target as Element | null)?.closest?.('[role="dialog"]')) return;
      event.preventDefault(); addTabRef.current();
    };
    document.addEventListener('keydown', shortcut);
    return () => document.removeEventListener('keydown', shortcut);
  }, [state.hostPlatform]);
  // A click beside the sheet minimizes it and still reaches what was clicked. Dialogs opened from the sheet are part of it,
  // and the project list keeps it open so choosing another project switches to that project's agents.
  useEffect(() => {
    if (!open) return;
    const minimize = (event: PointerEvent) => { const target = event.target as Element; if (!sheet.current?.contains(target) && !target.closest('[role="dialog"], .dialog-overlay, nav[aria-label="Projects"]')) onOpenChange(false); };
    document.addEventListener('pointerdown', minimize);
    return () => document.removeEventListener('pointerdown', minimize);
  }, [open, onOpenChange]);
  // Launch when the sheet is first opened, not for every project that is selected.
  useEffect(() => { if (open && command) setOpened(true); }, [open, command]);
  const title = outdated ?? label;
  const action = 'px-2 text-muted-foreground';
  return <>
    {!open && <button type="button" title={`Open the ${title} terminal (Space)`} onClick={() => onOpenChange(true)} className="fixed bottom-11 right-7 z-30 flex items-center gap-2.5 rounded-full border bg-[var(--dialog)] py-2 pl-3 pr-4 text-xs shadow-[0_0_30px_-5px_rgb(0_0_0/0.3)] transition-colors hover:bg-[var(--surface-hover)]"><Bot className="size-4 text-primary" /><span className="font-medium">{title}</span><span className="text-muted-foreground"><Activity status={projectStatus} /></span></button>}
    {/* Wide, because the agent is the focus while it is open. Starts below the window header so Run project and the command menu stay reachable. */}
    <aside ref={sheet} aria-label={`${title} terminal`} inert={!open} className={cn('fixed bottom-0 right-2 top-14 z-30 flex w-[78vw] flex-col overflow-hidden rounded-t-2xl border border-b-0 bg-[var(--dialog)] shadow-[0_0_50px_-5px_rgb(0_0_0/0.25)] transition-transform duration-300 ease-in-out', !open && 'translate-x-[calc(100%+1.5rem)]')}>
      <div className="flex shrink-0 items-center gap-2 border-b px-4 py-3">
        <div className="min-w-0 flex-1"><h2 className="truncate text-sm font-medium">{title}</h2><p className="flex items-center gap-1.5 text-xs text-muted-foreground"><Activity status={status} />{status && <span>·</span>}<span className="shrink-0">{project.name}</span><span>·</span><span className="mono min-w-0 truncate text-[11px]" title={directory}>{shortPath(directory)}</span></p></div>
        <select aria-label="Harness for this project" title="Harness for this project" value={selected} onChange={event => choose(event.target.value)} className="h-8 max-w-56 shrink-0 truncate rounded-md border bg-[var(--surface)] px-2 text-xs"><option value="default">Default · {harnessLabel(state.settings)}</option>{harnesses.filter(harness => harness.value !== 'custom').map(({ value, label }) => <option key={value} value={value}>{label}</option>)}{customs.map(custom => <option key={custom} value={`custom:${custom}`}>{custom}</option>)}<option value="new">Custom command…</option></select>
        {outdated && command ? <Button variant="outline" size="sm" title={`Stop ${outdated} and start ${label}`} onClick={() => launchCurrent(true)}><RefreshCw />Restart with {label}</Button>
          : <Button variant="ghost" size="sm" className={action} disabled={!opened || !command} title={`Start ${label} again in a fresh terminal`} onClick={() => launchCurrent(true)}><RefreshCw />Restart</Button>}
        <Button variant="ghost" size="sm" className={action} disabled={!status || status.state === 'exited'} title="Stop the harness" onClick={() => void window.devenv.harnessClose(harnessKey(project.id, current)).catch(() => {})}><Square />Stop</Button>
        <Button variant="ghost" size="sm" className={action} title="Minimize. The harness keeps running." onClick={() => onOpenChange(false)}><ChevronsRight />Minimize</Button>
      </div>
      <div className="terminal-panel flex min-h-0 flex-1 flex-col bg-[#282C34] text-[var(--terminal-foreground)]">
        {!opened && <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center text-[11px] text-[#7F8A99]">{command ? <span>› {label} starts here when you open this sheet.</span> : override ? <span>Choose a harness for this project to use this terminal.</span> : <><span>Enter the command for your custom harness to use this terminal.</span><button className="flex items-center gap-1.5 text-[var(--terminal-foreground)] hover:text-white" onClick={onSettings}><Settings2 className="size-3" />Open Settings</button></>}</div>}
        {opened && <div className="flex shrink-0 items-center gap-1 overflow-x-auto border-b border-white/8 bg-[#303641] px-2 py-1.5">
          <div role="tablist" aria-label="Agent tabs" className="flex min-w-0 items-center gap-0.5">{tabs.map((tab, index) => {
            const tabStatus = statusOf(tab), look = lookOf(tab);
            const name = look.name ?? `${tabStatus ? presetLabel(tabStatus.command) : label}${tabs.length > 1 ? ` ${index + 1}` : ''}`;
            return <div key={tab} onContextMenu={event => openMenu(tab, event)} className={cn('group flex shrink-0 items-center rounded text-[11px] text-[#7F8A99] hover:text-[var(--terminal-foreground)]', tab === current && 'bg-[#383E4A] text-[var(--terminal-foreground)]')}>
              {renaming === tab
                ? <input autoFocus aria-label="Tab name" defaultValue={name} maxLength={40} onFocus={event => event.currentTarget.select()} onKeyDown={event => { event.stopPropagation(); if (event.key === 'Escape') cancelRename.current = true; if (event.key === 'Enter' || event.key === 'Escape') event.currentTarget.blur(); }} onBlur={event => { if (!cancelRename.current) setLook(tab, { name: event.currentTarget.value.trim() || undefined }); cancelRename.current = false; setRenaming(undefined); }} className="my-0.5 ml-1 w-32 rounded bg-[#282C34] px-1.5 py-0.5 text-[11px] text-[var(--terminal-foreground)] outline-none ring-1 ring-white/20" />
                : <button type="button" role="tab" aria-selected={tab === current} title={`${tabStatus ? activityLabel[tabStatus.state] : name}. Double-click to rename, right-click for color.`} onClick={() => select(tab)} onDoubleClick={() => setRenaming(tab)} className={cn('flex items-center gap-1.5 py-1 pl-2.5 pr-1', tabStatus?.state === 'exited' && 'opacity-60')}>
                  {look.color && <span data-testid="tab-color" className="size-2 shrink-0 rounded-full" style={{ background: look.color }} />}{name}{tabStatus?.state === 'working' && <LoaderCircle aria-label="Working" className="size-3 animate-spin text-amber-500" />}
                </button>}
              <button type="button" aria-label={`Close ${name}`} title="Close tab and stop its harness" onClick={() => closeTab(tab)} className={cn('mr-1 rounded p-0.5 hover:bg-white/10 focus-visible:opacity-100', tab === current ? 'opacity-100' : 'opacity-0 group-hover:opacity-100')}><X className="size-3" /></button>
            </div>;
          })}</div>
          <button type="button" aria-label="New tab" title={`New tab (${state.hostPlatform === 'macos' ? '⌘T' : 'Ctrl+Shift+T'})`} disabled={!command} onClick={addTab} className="shrink-0 rounded p-1 text-[#7F8A99] hover:bg-white/10 hover:text-[var(--terminal-foreground)] disabled:opacity-30"><Plus className="size-3.5" /></button>
        </div>}
        {opened && tabs.map(tab => <div key={tab} className={cn('flex min-h-0 flex-1 flex-col', tab !== current && 'hidden')}><HarnessTab id={harnessKey(project.id, tab)} visible={open && tab === current} host={state.hostPlatform} launches={launches} /></div>)}
      </div>
      {menu && <div role="menu" aria-label="Tab options" style={{ left: menu.left, top: menu.top }} className="absolute z-40 w-44 rounded-md border bg-[var(--dialog)] p-1 text-xs shadow-lg">
        <button type="button" role="menuitem" onClick={() => { setRenaming(menu.tab); setMenu(undefined); }} className="flex w-full items-center gap-2 rounded px-2 py-1.5 hover:bg-[var(--surface-hover)]"><Pencil className="size-3 text-muted-foreground" />Rename</button>
        <div className="my-1 border-t" />
        <div role="group" aria-label="Tab color" className="flex flex-wrap gap-1 px-1.5 py-1">
          <button type="button" role="menuitemradio" aria-label="No color" title="No color" aria-checked={!lookOf(menu.tab).color} onClick={() => { setLook(menu.tab, { color: undefined }); setMenu(undefined); }} className="flex size-6 items-center justify-center rounded hover:bg-[var(--surface-hover)] aria-checked:ring-1 aria-checked:ring-primary"><span className="size-3 rounded-full border border-dashed border-muted-foreground" /></button>
          {tabColors.map(color => <button key={color.value} type="button" role="menuitemradio" aria-label={color.label} title={color.label} aria-checked={lookOf(menu.tab).color === color.value} onClick={() => { setLook(menu.tab, { color: color.value }); setMenu(undefined); }} className="flex size-6 items-center justify-center rounded hover:bg-[var(--surface-hover)] aria-checked:ring-1 aria-checked:ring-primary"><span className="size-3 rounded-full" style={{ background: color.value }} /></button>)}
        </div>
      </div>}
    </aside>
    <Dialog open={asking} onOpenChange={setAsking}><DialogContent className="max-w-md"><form className="grid gap-5" onSubmit={useDraft}>
      <div><DialogTitle>Custom harness</DialogTitle><DialogDescription className="mt-2">Enter the command that starts your coding agent. It runs through your shell in this project’s folder, and stays in the harness menu while a project uses it.</DialogDescription></div>
      <Input autoFocus aria-label="Harness command" className="mono" placeholder="gemini" value={draft} onChange={event => setDraft(event.target.value)} onFocus={event => event.currentTarget.select()} />
      <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setAsking(false)}>Cancel</Button><Button type="submit" disabled={!draft.trim()}>Use command</Button></div>
    </form></DialogContent></Dialog>
  </>;
}
