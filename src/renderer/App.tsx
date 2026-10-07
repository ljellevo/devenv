import { ExecutionTargetPicker } from './ExecutionTargetPicker';
import { fileManager, platformName, shortcutModifier } from '../shared/platform';
import type { HelpContext } from '../shared/help';
import { useEffect, useRef, useState } from 'react';
import { Terminal, Play, Square, ArrowLeftRight, FolderPlus, FolderOpen, Search, Settings2, RefreshCw, FileCode2, ChevronRight, Layers3, CircleAlert, Copy, Pause, ArrowDownToLine, Check, Radio, Circle, ExternalLink, CircleHelp, Download, ChevronDown, Pin, PinOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { Settings, type SettingsTab } from './Settings';
import { ConfigEditor } from './ConfigEditor';
import { CommandPalette } from './CommandPalette';
import { Help } from './Help';
import { ProjectSetup } from './ProjectSetup';
import { Onboarding } from './Onboarding';
import { useResolvedAppearance } from './appearance';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { ProjectTree } from './ProjectTree';
import { InstallPanel } from './InstallPanel';
import { terminalLabel } from '../shared/terminals';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { AppState, LogEntry, ServiceStatus } from '../shared/types';

const statusStyle: Record<ServiceStatus, string> = { pending: 'bg-slate-50 text-slate-500', starting: 'bg-amber-50 text-amber-700 border-amber-200', running: 'bg-emerald-50 text-emerald-700 border-emerald-200', ready: 'bg-emerald-50 text-emerald-700 border-emerald-200', completed: 'bg-sky-50 text-sky-700 border-sky-200', failed: 'bg-red-50 text-red-700 border-red-200', stopping: 'bg-amber-50 text-amber-700 border-amber-200', stopped: 'bg-slate-50 text-slate-500' };
const stopButtonClass = 'text-destructive hover:bg-destructive/10 hover:text-destructive';
function Status({ status }: { status: ServiceStatus }) { return <Badge className={cn('gap-1.5 capitalize', statusStyle[status])}><span className={cn('size-1.5 rounded-full bg-current', ['starting', 'stopping'].includes(status) && 'status-pulse')} />{status}</Badge>; }
function shortPath(path: string) { return path.replace(/^\/Users\/[^/]+\//, '~/'); }
// Strip terminal control sequences before rendering. Logs are always text, never HTML.
function clean(text: string) { return text.replace(/\x1b\][^\x07]*(?:\x07|\x1b\\)/g, '').replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '').replace(/\r(?!\n)/g, '\n'); }

export function App() {
  const [state, setState] = useState<AppState>();
  const [selected, setSelected] = useState<string>();
  const [search, setSearch] = useState('');
  const [settings, setSettings] = useState(false);
  const [settingsTab, setSettingsTab] = useState<SettingsTab>('general');
  const [view, setView] = useState<'services' | 'terminal' | 'config' | 'install'>('services');
  const [installMenu, setInstallMenu] = useState(false);
  const installMenuHost = useRef<HTMLDivElement>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [helpContext, setHelpContext] = useState<HelpContext>({ host: 'macos', target: { kind: 'native' } });
  function openHelp() { setHelpContext({ host: state?.hostPlatform ?? 'macos', target: (state?.projects.find(p => p.id === selected) ?? state?.projects.find(p => p.id === state.session?.project.id) ?? state?.projects[0])?.executionTarget ?? { kind: 'native' } }); setHelpOpen(true); }
  const [setupPath, setSetupPath] = useState<string | null>(null);
  // Decided once per launch, so resetting the tutorial in Settings takes effect on the next launch.
  const [onboarding, setOnboarding] = useState<boolean>();
  const [configDirty, setConfigDirty] = useState(false);
  const [pendingAction, setPendingAction] = useState<{ kind: 'project'; id: string } | { kind: 'created'; project: { id: string; path: string } } | null>(null);
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [serviceFilter, setServiceFilter] = useState('');
  const [textFilter, setTextFilter] = useState('');
  const [following, setFollowing] = useState(true);
  const [copied, setCopied] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);
  const sessionId = useRef<string | undefined>(undefined);
  const logBuffer = useRef<LogEntry[]>([]);
  const sidebarTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sidebarDragging = useRef(false);
  const sidebarHovered = useRef(false);

  function run(action: () => Promise<unknown>) { setError(undefined); setBusy(true); void action().catch(e => setError(String(e.message ?? e))).finally(() => setBusy(false)); }
  useEffect(() => {
    if (!window.devenv) { setError('Open Devenv as a desktop app to manage your services.'); return; }
    const consume = (value: AppState) => {
      if (sessionId.current !== value.session?.id) { sessionId.current = value.session?.id; logBuffer.current = []; setLogs([]); }
      setState(value);
      setOnboarding(shown => shown ?? !value.settings.onboardingCompleted);
    };
    const off = window.devenv.onState(consume);
    const offLog = window.devenv.onLog(entry => { logBuffer.current = [...logBuffer.current, entry].slice(-1500); });
    void window.devenv.state().then(consume).catch(e => setError(e.message));
    return () => { off(); offLog(); };
  }, []);
  useEffect(() => {
    if (!state?.session) return;
    const id = state.session.id;
    void window.devenv.logs().then(entries => {
      if (sessionId.current !== id) return;
      const merged = new Map([...entries, ...logBuffer.current].map(entry => [entry.seq, entry]));
      logBuffer.current = [...merged.values()].sort((a, b) => a.seq - b.seq).slice(-1500); setLogs(logBuffer.current);
    }).catch(e => setError(e.message));
  }, [state?.session?.id]);
  useEffect(() => {
    if (!following) return;
    const timer = setInterval(() => setLogs(logBuffer.current), 200); return () => clearInterval(timer);
  }, [following]);
  useEffect(() => { if (following) bottom.current?.scrollIntoView({ block: 'end' }); }, [logs, following]);
  const appearance = useResolvedAppearance(state?.settings.appearance ?? 'dark');
  useEffect(() => { document.documentElement.dataset.theme = appearance; }, [appearance]);
  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); setPaletteOpen(open => !open); }
    };
    document.addEventListener('keydown', shortcut);
    return () => document.removeEventListener('keydown', shortcut);
  }, []);
  useEffect(() => () => { if (sidebarTimer.current) clearTimeout(sidebarTimer.current); }, []);
  useEffect(() => {
    if (!installMenu) return;
    const close = (event: PointerEvent) => { if (!installMenuHost.current?.contains(event.target as Node)) setInstallMenu(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') setInstallMenu(false); };
    document.addEventListener('pointerdown', close); document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('pointerdown', close); document.removeEventListener('keydown', escape); };
  }, [installMenu]);

  const openSidebar = () => { sidebarHovered.current = true; if (sidebarTimer.current) clearTimeout(sidebarTimer.current); setSidebarOpen(true); };
  const closeSidebarSoon = () => { sidebarHovered.current = false; if (sidebarTimer.current) clearTimeout(sidebarTimer.current); sidebarTimer.current = setTimeout(() => { if (!sidebarDragging.current && !sidebarHovered.current) setSidebarOpen(false); }, 180); };
  const togglePinned = () => { if (!state) return; const pinned = !state.settings.sidebarPinned; if (!pinned) openSidebar(); run(() => window.devenv.saveSettings({ ...state.settings, sidebarPinned: pinned })); };
  const selectProject = (id: string) => {
    if (id === (selected ?? state?.session?.project.id ?? state?.projects[0]?.id)) { setSidebarOpen(false); return; }
    if (configDirty) { setPendingAction({ kind: 'project', id }); return; }
    setSelected(id); setInstallMenu(false); setServiceFilter(''); setView('services'); setSidebarOpen(false);
  };
  const showCreatedProject = (created: { id: string; path: string }) => { setSelected(created.id); setServiceFilter(''); setView('config'); setSidebarOpen(false); setSetupPath(created.path); };
  const createProject = async () => {
    setError(undefined); setBusy(true);
    try { const created = await window.devenv.createProject(); if (created) { if (configDirty) setPendingAction({ kind: 'created', project: created }); else showCreatedProject(created); } return !!created; }
    catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); return false; }
    finally { setBusy(false); }
  };
  const confirmDiscard = () => { const action = pendingAction; setPendingAction(null); if (action) setConfigDirty(false); if (action?.kind === 'project') { setSelected(action.id); setServiceFilter(''); setView('services'); setSidebarOpen(false); } else if (action?.kind === 'created') showCreatedProject(action.project); };

  if (!state) return <div className="flex h-screen items-center justify-center gap-3 text-muted-foreground"><ArrowLeftRight className="size-5" />{error || 'Opening your workspace…'}</div>;
  const session = state.session;
  const active = session && !['stopped', 'failed'].includes(session.status);
  const project = state.projects.find(p => p.id === selected) ?? state.projects.find(p => p.id === session?.project.id) ?? state.projects[0];
  const current = project && session?.project.id === project.id;
  const snapshot = current && active ? session.project : project;
  const services = snapshot?.services ?? [];
  const running = current && active;
  const pinned = !!state.settings.sidebarPinned;
  const transitioning = ['starting', 'stopping'].includes(session?.status ?? '');
  const visibleLogs = logs.filter(entry => (!serviceFilter || entry.service === serviceFilter) && (!textFilter || clean(entry.text).toLowerCase().includes(textFilter.toLowerCase())));
  const problem = error || state.error;
  const count = session?.services.filter(s => ['running', 'ready'].includes(s.status)).length ?? 0;
  const missingServices = !!running && services.some(s => s.enabled && ['stopped', 'failed', 'pending'].includes(session.services.find(item => item.name === s.name)?.status ?? 'stopped'));
  const installing = !!project && state.installState?.projectId === project.id && state.installState.status === 'running';
  const installAction = (mode: 'resume' | 'restart' = 'resume') => { if (!project) return; setView('install'); setInstallMenu(false); run(() => window.devenv.install(project.id, mode)); };

  return <div className="app-shell flex h-screen min-h-0 overflow-hidden" style={{ '--terminal-accent': state.theme?.accent ?? '#00FF00', '--terminal-secondary': state.theme?.secondary ?? '#875FFF', '--terminal-background': '#282C34', '--terminal-foreground': state.theme?.foreground ?? '#ABB2BF' } as React.CSSProperties}>
    {!pinned && <div aria-hidden="true" onMouseEnter={openSidebar} onMouseLeave={closeSidebarSoon} className="fixed inset-y-12 left-0 z-30 w-2" />}
    <aside onMouseEnter={openSidebar} onMouseLeave={closeSidebarSoon} className={cn('z-40 flex w-[270px] shrink-0 flex-col border-r', pinned ? 'relative bg-[var(--sidebar-pinned)]' : 'fixed inset-y-0 left-0 bg-[var(--sidebar)] shadow-xl transition-transform duration-200', pinned || sidebarOpen ? 'translate-x-0' : '-translate-x-full')}>
      <div className="drag h-12 shrink-0" />
      <div className="px-5 pb-7 pt-2"><div className="flex items-center gap-2.5"><div className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm"><ArrowLeftRight className="size-4" strokeWidth={2.2} /></div><span className="text-xl font-semibold tracking-tight">devenv<span className="text-[var(--terminal-secondary)]">.</span></span><button type="button" aria-label={pinned ? 'Unpin sidebar' : 'Pin sidebar open'} aria-pressed={pinned} title={pinned ? 'Unpin sidebar' : 'Pin sidebar open'} onClick={togglePinned} className={cn('ml-auto rounded-md p-1.5 hover:bg-[var(--surface-hover)] hover:text-foreground', pinned ? 'text-primary' : 'text-muted-foreground')}>{pinned ? <PinOff className="size-3.5" /> : <Pin className="size-3.5" />}</button></div><p className="mt-3 text-xs text-muted-foreground">A little order for your local world.</p></div>
      <div className="px-4"><div className="relative"><Search className="absolute left-2.5 top-2.5 size-3.5 text-muted-foreground" /><Input aria-label="Search projects" placeholder="Find a project…" value={search} onChange={e => setSearch(e.target.value)} className="h-8 border-transparent bg-[var(--surface)] pl-8 text-xs shadow-none" /></div></div>
      <ProjectTree projects={state.projects} settings={state.settings} selectedId={project?.id} activeId={active ? session.project.id : undefined} activeStatus={session?.status} search={search} onSelect={selectProject} onDragChange={dragging => { sidebarDragging.current = dragging; if (!dragging && !sidebarHovered.current) closeSidebarSoon(); }} run={run} />
      <div className="p-3"><Button variant="ghost" className="w-full justify-start text-xs text-muted-foreground" onClick={() => run(() => window.devenv.addFolder())}><FolderPlus />Add search folder</Button><Button variant="ghost" className="w-full justify-start text-xs text-muted-foreground" onClick={() => run(() => window.devenv.scan())}><RefreshCw className={cn(state.scanning && 'animate-spin')} />Refresh projects</Button></div>
      {state.update.status === 'available' && <button onClick={() => { setSettingsTab('updates'); setSettings(true); }} className="mx-3 mb-3 rounded-xl border border-primary/30 bg-[var(--surface)] p-3 text-left shadow-sm transition-colors hover:bg-[var(--surface-hover)]"><span className="flex items-center gap-2 text-xs font-semibold text-primary"><span className="size-1.5 rounded-full bg-primary" />Update available</span><span className="mt-1 block text-[11px] text-foreground">Devenv {state.update.latest}</span><span className="mt-2 flex items-center justify-between text-[10px] text-muted-foreground">Open Settings to install<ChevronRight className="size-3" /></span></button>}
      <div className="space-y-1 border-t px-4 py-4"><button onClick={() => { openHelp(); setSidebarOpen(false); }} className="flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-xs text-muted-foreground hover:bg-[var(--surface-hover)]"><CircleHelp className="size-4" /><span>Help</span></button><button onClick={() => { setSettingsTab('general'); setSettings(true); setSidebarOpen(false); }} className="flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-xs text-muted-foreground hover:bg-[var(--surface-hover)]"><Settings2 className="size-4" /><span>Settings</span><span className="ml-auto mono text-[10px]">v{state.update.current}</span>{state.update.status === 'available' && <span className="size-1.5 rounded-full bg-primary" />}</button></div>
    </aside>
    <main className="flex min-w-0 flex-1 flex-col">
      <header className="drag grid h-14 shrink-0 grid-cols-[minmax(0,1fr)_clamp(420px,36vw,480px)_minmax(0,1fr)] items-center gap-3 px-7">
        <div aria-hidden="true" />
        <button type="button" aria-label="Search projects and commands" onClick={() => setPaletteOpen(true)} className="no-drag flex h-9 w-full items-center gap-2 rounded-lg border bg-[var(--surface)] px-3 text-left text-xs text-muted-foreground shadow-sm hover:bg-[var(--surface-hover)]">
          <Search className="size-3.5 shrink-0" /><span className="min-w-0 flex-1 truncate">Search projects and commands…</span><kbd className="shrink-0 rounded border px-1.5 py-0.5 text-[10px]">{shortcutModifier(state.hostPlatform)} K</kbd>
        </button>
        {project && <div className="no-drag flex items-center justify-self-end gap-2">
          <div className="flex items-center">
            {installing ? <Button variant="ghost" className={stopButtonClass} size="sm" onClick={() => void window.devenv.cancelInstall()}><Square className="size-3" />Cancel install</Button>
              : running ? <Button variant="ghost" className={stopButtonClass} size="sm" disabled={session.status === 'stopping'} onClick={() => run(() => window.devenv.stop())}><Square className="size-3" />{session.status === 'starting' ? 'Cancel startup' : 'Stop project'}</Button>
              : <Button size="sm" className="rounded-r-none" disabled={busy || transitioning || !!project.error || !!project.draft} onClick={() => project.install && !project.installed ? installAction() : run(() => window.devenv.start(project.id))}>{project.install && !project.installed ? <Download /> : <Play />}{project.install && !project.installed ? 'Install project' : 'Run project'}</Button>}
            {!installing && !running && <div ref={installMenuHost} className="relative">
              <Button variant="default" size="sm" className="rounded-l-none border-l border-primary-foreground/25 px-2" aria-label="Project actions" aria-haspopup="menu" aria-expanded={installMenu} onClick={() => setInstallMenu(open => !open)}><ChevronDown className="size-3.5" /></Button>
              {installMenu && <div role="menu" className="absolute right-0 top-9 z-50 min-w-40 rounded-lg border bg-[var(--dialog)] p-1 shadow-lg"><button role="menuitem" className="w-full rounded px-3 py-2 text-left text-xs hover:bg-[var(--surface-hover)] disabled:opacity-45" disabled={!project.install} title={project.install ? undefined : "Add an install section to devenv.toml to enable reinstalling"} onClick={() => installAction('restart')}>Reinstall project</button></div>}
            </div>}
          </div>
        </div>}
      </header>
      {problem && <div role="alert" className="mx-7 mt-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-800"><CircleAlert className="mt-0.5 size-4 shrink-0" /><p className="break-all">{problem}</p></div>}
      {state.scanErrors.length > 0 && <details className="mx-7 mt-3 text-xs text-amber-700"><summary>{state.scanErrors.length} folder scanning issue(s)</summary><pre className="max-h-24 overflow-auto whitespace-pre-wrap">{state.scanErrors.join('\n')}</pre></details>}
      {!project ? <div className="flex flex-1 flex-col items-center justify-center px-10 pb-16 text-center"><div className="mb-6 flex size-16 items-center justify-center rounded-2xl border bg-[var(--surface)] shadow-sm"><Layers3 className="size-7 text-primary" /></div><h1 className="text-2xl font-semibold tracking-tight">Your projects, in one place.</h1><p className="mt-3 max-w-sm text-sm leading-6 text-muted-foreground">Add a folder containing your projects. Devenv finds their <span className="mono text-xs">devenv.toml</span> files, wherever they live.</p><Button className="mt-6" onClick={() => run(() => window.devenv.addFolder())}><FolderPlus />Add search folder</Button><div className="mt-8 rounded-lg border bg-[var(--surface)] px-5 py-4 text-left"><p className="mb-2 text-xs font-medium">A small file. A complete session.</p><pre className="mono text-[11px] leading-5 text-muted-foreground">{'version = 1\nname = "My project"\n\n[services.api]\ncwd = "./api"\ncommand = "npm run dev"\nports = [3100]'}</pre></div></div> : <>
        <section className="shrink-0 px-7 pb-5 pt-7"><div><div className="mb-2 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[.16em] text-muted-foreground"><span className="h-px w-4 bg-primary" />Local environment</div><div className="flex items-center justify-between gap-4"><h1 className="min-w-0 truncate text-[29px] font-semibold leading-tight tracking-tight">{project.name}</h1><div className="flex shrink-0 items-center gap-2"><Button variant="outline" size="sm" title={`Show devenv.toml in ${fileManager(state.hostPlatform)}`} onClick={() => run(() => window.devenv.openConfigFinder(project.id))}><FolderOpen />Open in {fileManager(state.hostPlatform)}</Button><Button variant="outline" size="sm" title={`Open a new ${terminalLabel(state.settings.terminal, state.hostPlatform)} window in the config folder`} onClick={() => run(() => window.devenv.openConfigTerminal(project.id))}><Terminal />Open in {terminalLabel(state.settings.terminal, state.hostPlatform)}</Button></div></div><p title={project.path} className="mono mt-2 max-w-[440px] truncate text-[11px] text-muted-foreground">{shortPath(project.path)}</p><ExecutionTargetPicker onSelect={setSelected} state={state} project={project} run={run} /></div>
          <div className="mt-6 grid grid-cols-3 overflow-hidden rounded-lg border bg-[var(--surface)]"><div className="px-4 py-3"><p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Session</p><p className="mt-1.5 flex items-center gap-2 text-sm font-medium capitalize"><Radio className={cn('size-3.5', running ? 'text-emerald-600' : 'text-slate-400')} />{project.draft ? 'Draft' : current ? session.status : 'Stopped'}</p></div><div className="border-x px-4 py-3"><p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Services running</p><p className="mono mt-1.5 text-sm">{current ? count : 0}<span className="text-muted-foreground"> / {services.filter(s => s.enabled && s.mode !== 'task').length}</span></p></div><div className="px-4 py-3"><p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Environment</p><p className="mt-1.5 flex items-center gap-2 text-sm"><Circle className="size-3 text-primary" />One project at a time</p></div></div>
        </section>
        {project.draft && <div className="mx-7 mb-4 rounded-lg border bg-[var(--surface)] px-4 py-3 text-xs text-muted-foreground">This project is a draft. Add at least one service in Config before starting it.</div>}
        <Tabs value={view} onValueChange={value => setView(value as 'services' | 'terminal' | 'config' | 'install')} className="mx-7 mb-5 mt-1 flex min-h-0 flex-1 flex-col">
          <TabsList className="w-fit shrink-0"><TabsTrigger value="services">Services</TabsTrigger><TabsTrigger value="terminal">Terminal</TabsTrigger>{project.install && <TabsTrigger value="install">Install</TabsTrigger>}<TabsTrigger value="config" className="gap-1.5"><FileCode2 className="size-3.5" />Config{configDirty && <span className="size-1.5 rounded-full bg-amber-500" aria-label="Unsaved changes" />}</TabsTrigger></TabsList>
          <TabsContent value="services" className="mt-3 min-h-0 flex-1 overflow-auto">
        {snapshot?.error ? <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800"><strong>Check your configuration</strong><pre className="mt-2 whitespace-pre-wrap text-xs">{snapshot.error}</pre></div> : <section className="overflow-auto rounded-lg border bg-[var(--surface)]">
          <div className="sticky top-0 z-10 flex items-center justify-between border-b bg-[var(--surface)] px-4 py-2.5"><h2 className="text-xs font-semibold">Services</h2>{missingServices ? <Button size="sm" variant="outline" disabled={busy || transitioning} onClick={() => run(() => window.devenv.start(project.id))}><Play />Start remaining</Button> : <span className="text-[10px] text-muted-foreground">Started in dependency order</span>}</div>
          <table className="w-full text-left text-xs"><thead className="bg-[var(--surface-hover)] text-[10px] font-medium uppercase tracking-wider text-muted-foreground"><tr><th className="px-4 py-2 font-medium">Service / command</th><th className="px-2 py-2 font-medium">Port</th><th className="px-2 py-2 font-medium">Status</th><th className="w-28 px-2"><span className="sr-only">Actions</span></th></tr></thead><tbody>
            {services.map(service => {
              const serviceState = current ? session.services.find(s => s.name === service.name) : undefined;
              return <tr key={service.name} className={cn('border-t hover:bg-[var(--surface-hover)]', !service.enabled && 'opacity-45')}><td className="px-4 py-2.5"><button className="max-w-full text-left" onClick={() => { setServiceFilter(service.name); setView('terminal'); }}><span className="flex items-center gap-2 font-medium"><Terminal className="size-3.5 text-muted-foreground" />{service.name}{service.mode === 'task' && <span className="font-normal text-muted-foreground">· task</span>}</span><span title={`${service.cwd}\n${service.command}`} className="mono mt-1 block max-w-[330px] truncate text-[10px] text-muted-foreground">{service.command}</span></button>{serviceState?.error && <p className="mt-1 max-w-[360px] break-words text-[10px] text-destructive">{serviceState.error}</p>}</td><td className="mono px-2 text-[11px] text-muted-foreground">{service.ports.join(', ') || '—'}</td><td className="px-2">{service.enabled ? <Status status={serviceState?.status ?? 'stopped'} /> : <span className="text-[11px] text-muted-foreground">Disabled</span>}</td><td className="px-2">{service.enabled && (() => { const status = serviceState?.status ?? 'stopped'; const disabled = busy || transitioning || ['starting', 'stopping'].includes(status); return running && ['running', 'ready'].includes(status) ? <Button size="sm" variant="ghost" className={stopButtonClass} aria-label={`Stop ${service.name}`} title={`Stop ${service.name} and services that depend on it`} disabled={disabled} onClick={() => run(() => window.devenv.stopService(project.id, service.name))}><Square />Stop</Button> : running && status === 'completed' ? <Button size="sm" variant="ghost" aria-label={`Run ${service.name} again`} disabled={disabled} onClick={() => run(() => window.devenv.restart(service.name))}><RefreshCw />Run again</Button> : <Button size="sm" variant="ghost" aria-label={`${status === 'failed' ? 'Retry' : 'Start'} ${service.name}`} title={active && !current ? `Switch to ${project.name} and start ${service.name}` : `Start ${service.name} and its dependencies`} disabled={disabled || !!project.error || !!project.draft} onClick={() => run(() => window.devenv.startService(project.id, service.name))}><Play />{status === 'failed' ? 'Retry' : 'Start'}</Button>; })()}</td></tr>;
            })}
          </tbody></table>
        </section>}
          </TabsContent>
          <TabsContent value="terminal" className="mt-3 flex min-h-0 flex-1 flex-col">
        <section className="terminal-panel flex min-h-[130px] flex-1 flex-col overflow-hidden rounded-lg border border-[#404651] bg-[#282C34] text-[var(--terminal-foreground)]">
          <div className="flex shrink-0 items-center justify-between gap-2 border-b border-white/8 bg-[#303641] px-4 py-2.5"><div className="flex items-center gap-2"><Terminal className="size-3.5 text-[var(--terminal-accent)]" /><h2 className="text-xs font-medium">Console</h2><select aria-label="Filter logs by service" value={serviceFilter} onChange={e => setServiceFilter(e.target.value)} className="ml-2 rounded border border-white/10 bg-[#383E4A] px-2 py-1 text-[10px] text-[var(--terminal-foreground)]"><option value="">All services</option>{services.map(s => <option key={s.name}>{s.name}</option>)}</select></div><div className="flex items-center gap-3 text-[var(--terminal-foreground)]"><button title={following ? 'Pause logs' : 'Follow logs'} aria-label={following ? 'Pause logs' : 'Follow logs'} onClick={() => setFollowing(!following)}>{following ? <Pause className="size-3.5" /> : <ArrowDownToLine className="size-3.5" />}</button><button title="Copy visible logs" aria-label="Copy visible logs" onClick={() => { void navigator.clipboard.writeText(visibleLogs.map(e => clean(e.text)).join('')).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }); }}>{copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}</button><button disabled={!running} onClick={() => run(() => window.devenv.openTerminal())} className="flex items-center gap-1.5 text-[10px] disabled:opacity-30">Open in {terminalLabel(state.settings.terminal, state.hostPlatform)}<ExternalLink className="size-3" /></button></div></div>
          <div className="flex shrink-0 items-center gap-2 border-b border-white/5 px-4 py-1.5"><Search className="size-3 text-[#7F8A99]" /><input aria-label="Search logs" value={textFilter} onChange={e => setTextFilter(e.target.value)} placeholder="Filter output…" className="w-full bg-transparent text-[10px] text-[var(--terminal-foreground)] outline-none placeholder:text-[#7F8A99]" /></div>
          <div className="console mono min-h-0 flex-1 overflow-auto px-4 py-3 text-[10px] leading-[1.8]">
            {!current || !visibleLogs.length ? <div className="flex h-full min-h-10 items-center justify-center gap-2 text-[#7F8A99]"><span>›</span>{running ? 'Waiting for service output…' : 'Start a session to see your service output here.'}</div> : visibleLogs.map(entry => <div key={entry.seq} className="flex items-start gap-3"><span className="shrink-0 select-none text-[#7F8A99]">{entry.time.slice(11, 19)}</span><span className="w-16 shrink-0 truncate text-[var(--terminal-secondary)]" title={entry.service}>{entry.service === '_session' ? 'devenv' : entry.service}</span><span className={cn('min-w-0 whitespace-pre-wrap break-all', entry.stream === 'stderr' && 'text-[#e8aa91]', entry.stream === 'system' && 'text-[#7F8A99]')}>{clean(entry.text)}</span></div>)}<div ref={bottom} />
          </div>
        </section>
          </TabsContent>
          <TabsContent value="config" forceMount className="mt-3 flex min-h-0 flex-1 flex-col data-[state=inactive]:hidden"><ConfigEditor key={project.id} project={project} visible={view === 'config'} onDirtyChange={setConfigDirty} active={!!running} appearance={appearance} host={state.hostPlatform} /></TabsContent>
          {project.install && <TabsContent value="install" forceMount className="mt-3 flex min-h-0 flex-1 flex-col data-[state=inactive]:hidden"><InstallPanel key={project.id} project={project} install={project.install} installState={state.installState} output={state.installOutput} active={view === 'install'} onInstall={installAction} /></TabsContent>}
        </Tabs>
      </>}
      <footer className="flex h-8 shrink-0 items-center justify-between border-t px-7 text-[10px] text-muted-foreground"><span>Local commands. A shared routine.</span><span>{state.scanning ? 'Discovering projects…' : `${state.settings.roots.length} search folder${state.settings.roots.length === 1 ? '' : 's'}`}<span className="mx-2 opacity-30">|</span>{platformName(state.hostPlatform)}</span></footer>
    </main>
    <CommandPalette state={state} open={paletteOpen} setOpen={setPaletteOpen} onProject={selectProject} onCreate={() => void createProject()} onAddFolder={() => run(() => window.devenv.addFolder())} onHelp={openHelp} onSettings={() => { setSettingsTab('general'); setSettings(true); }} />
    <Help context={helpContext} open={helpOpen} onOpenChange={setHelpOpen} />
    <ProjectSetup context={{ host: state.hostPlatform, target: state.projects.find(project => project.path === setupPath)?.executionTarget ?? { kind: 'native' } }} path={setupPath} onClose={() => setSetupPath(null)} />
    {/* Mark onboarding complete before creating: createProject may add a search folder, and saving stale settings afterwards would drop it. */}
    <Onboarding state={state} open={!!onboarding} run={run} onDone={() => { setOnboarding(false); run(() => window.devenv.saveSettings({ ...state.settings, onboardingCompleted: true })); }} onAddProject={() => run(async () => { await window.devenv.saveSettings({ ...state.settings, onboardingCompleted: true }); if (await createProject()) setOnboarding(false); })} />
    <Dialog open={!!pendingAction} onOpenChange={open => { if (!open) setPendingAction(null); }}><DialogContent><DialogTitle>Discard unsaved configuration edits?</DialogTitle><DialogDescription>Your edits have not been saved to devenv.toml.</DialogDescription><div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setPendingAction(null)}>Keep editing</Button><Button variant="destructive" onClick={confirmDiscard}>Discard and continue</Button></div></DialogContent></Dialog>
    {settings && <Settings state={state} open={settings} setOpen={setSettings} tab={settingsTab} setTab={setSettingsTab} run={run} />}
  </div>;
}
