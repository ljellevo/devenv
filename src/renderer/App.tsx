import { useEffect, useRef, useState } from 'react';
import { Terminal, Play, Square, ArrowRightLeft, ArrowLeftRight, FolderPlus, FolderOpen, Search, Settings2, RefreshCw, FileCode2, ChevronRight, Layers3, CircleAlert, Copy, Pause, ArrowDownToLine, Check, Radio, Circle, ExternalLink, Moon, Sun } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { Settings } from './Settings';
import { ConfigEditor } from './ConfigEditor';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { AppState, LogEntry, ServiceStatus } from '../shared/types';

const statusStyle: Record<ServiceStatus, string> = { pending: 'bg-slate-50 text-slate-500', starting: 'bg-amber-50 text-amber-700 border-amber-200', running: 'bg-emerald-50 text-emerald-700 border-emerald-200', ready: 'bg-emerald-50 text-emerald-700 border-emerald-200', completed: 'bg-sky-50 text-sky-700 border-sky-200', failed: 'bg-red-50 text-red-700 border-red-200', stopping: 'bg-amber-50 text-amber-700 border-amber-200', stopped: 'bg-slate-50 text-slate-500' };
function Status({ status }: { status: ServiceStatus }) { return <Badge className={cn('gap-1.5 capitalize', statusStyle[status])}><span className={cn('size-1.5 rounded-full bg-current', ['starting', 'stopping'].includes(status) && 'status-pulse')} />{status}</Badge>; }
function shortPath(path: string) { return path.replace(/^\/Users\/[^/]+\//, '~/'); }
// Strip terminal control sequences before rendering. Logs are always text, never HTML.
function clean(text: string) { return text.replace(/\x1b\][^\x07]*(?:\x07|\x1b\\)/g, '').replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '').replace(/\r(?!\n)/g, '\n'); }

export function App() {
  const [state, setState] = useState<AppState>();
  const [selected, setSelected] = useState<string>();
  const [search, setSearch] = useState('');
  const [settings, setSettings] = useState(false);
  const [editingConfig, setEditingConfig] = useState(false);
  const [view, setView] = useState<'services' | 'terminal'>('services');
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

  function run(action: () => Promise<unknown>) { setError(undefined); setBusy(true); void action().catch(e => setError(String(e.message ?? e))).finally(() => setBusy(false)); }
  useEffect(() => {
    if (!window.devenv) { setError('Open Devenv as a desktop app to manage your services.'); return; }
    const consume = (value: AppState) => {
      if (sessionId.current !== value.session?.id) { sessionId.current = value.session?.id; logBuffer.current = []; setLogs([]); }
      setState(value);
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
  useEffect(() => { document.documentElement.dataset.theme = state?.settings.appearance ?? 'dark'; }, [state?.settings.appearance]);

  if (!state) return <div className="flex h-screen items-center justify-center gap-3 text-muted-foreground"><ArrowLeftRight className="size-5" />{error || 'Opening your workspace…'}</div>;
  const session = state.session;
  const active = session && !['stopped', 'failed'].includes(session.status);
  const project = state.projects.find(p => p.id === selected) ?? state.projects.find(p => p.id === session?.project.id) ?? state.projects[0];
  const current = project && session?.project.id === project.id;
  const snapshot = current && active ? session.project : project;
  const services = snapshot?.services ?? [];
  const running = current && active;
  const transitioning = ['starting', 'stopping'].includes(session?.status ?? '');
  const visibleLogs = logs.filter(entry => (!serviceFilter || entry.service === serviceFilter) && (!textFilter || clean(entry.text).toLowerCase().includes(textFilter.toLowerCase())));
  const problem = error || state.error;
  const count = session?.services.filter(s => ['running', 'ready'].includes(s.status)).length ?? 0;
  const missingServices = !!running && services.some(s => s.enabled && ['stopped', 'failed', 'pending'].includes(session.services.find(item => item.name === s.name)?.status ?? 'stopped'));

  return <div className="app-shell flex h-screen min-h-0 overflow-hidden" style={{ '--terminal-accent': state.theme?.accent ?? '#00FF00', '--terminal-secondary': state.theme?.secondary ?? '#875FFF', '--terminal-background': '#282C34', '--terminal-foreground': state.theme?.foreground ?? '#ABB2BF' } as React.CSSProperties}>
    <aside className="flex w-[240px] shrink-0 flex-col border-r bg-[var(--sidebar)]">
      <div className="drag h-12 shrink-0" />
      <div className="px-5 pb-7 pt-2"><div className="flex items-center gap-2.5"><div className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm"><ArrowLeftRight className="size-4" strokeWidth={2.2} /></div><span className="text-xl font-semibold tracking-tight">devenv<span className="text-[var(--terminal-secondary)]">.</span></span></div><p className="mt-3 text-xs text-muted-foreground">A little order for your local world.</p></div>
      <div className="px-4"><div className="relative"><Search className="absolute left-2.5 top-2.5 size-3.5 text-muted-foreground" /><Input aria-label="Search projects" placeholder="Find a project…" value={search} onChange={e => setSearch(e.target.value)} className="h-8 border-transparent bg-[var(--surface)] pl-8 text-xs shadow-none" /></div></div>
      <div className="mt-6 flex items-center justify-between px-5 text-[10px] font-semibold uppercase tracking-[.14em] text-muted-foreground"><span>Projects <span className="ml-1 opacity-60">{state.projects.length}</span></span><button title="Refresh projects" aria-label="Refresh projects" onClick={() => run(() => window.devenv.scan())}><RefreshCw className={cn('size-3', state.scanning && 'animate-spin')} /></button></div>
      <nav aria-label="Projects" className="mt-3 flex-1 space-y-1 overflow-auto px-3">
        {state.projects.filter(p => p.name.toLowerCase().includes(search.toLowerCase())).map(p => <button key={p.id} onClick={() => { setSelected(p.id); setServiceFilter(''); setView('services'); }} className={cn('group flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left transition-colors', project?.id === p.id ? 'bg-[var(--surface)] shadow-xs ring-1 ring-black/4' : 'hover:bg-[var(--surface-hover)]')}>
          <div className={cn('flex size-8 shrink-0 items-center justify-center rounded-md border text-xs font-semibold', project?.id === p.id ? 'border-emerald-100 bg-emerald-50 text-primary' : 'border-border text-muted-foreground')}>{p.name.slice(0, 2).toUpperCase()}</div><div className="min-w-0 flex-1"><div className="truncate text-[13px] font-medium">{p.name}</div><div className="mt-0.5 text-[10px] text-muted-foreground">{p.error ? 'Configuration error' : `${p.services.filter(s => s.enabled).length} services`}</div></div>{active && session.project.id === p.id && <span className={cn('size-1.5 shrink-0 rounded-full', session.status === 'degraded' ? 'bg-amber-500' : 'bg-emerald-500')} />}
        </button>)}
        {search && !state.projects.some(p => p.name.toLowerCase().includes(search.toLowerCase())) && <p className="px-2 py-4 text-xs text-muted-foreground">No matching projects.</p>}
      </nav>
      <div className="p-3"><Button variant="ghost" className="w-full justify-start text-xs text-muted-foreground" onClick={() => run(() => window.devenv.addFolder())}><FolderPlus />Add search folder</Button></div>
      <div className="border-t px-4 py-4"><button onClick={() => setSettings(true)} className="flex w-full items-center gap-2.5 text-xs text-muted-foreground"><Settings2 className="size-4" /><span>Settings</span><span className="ml-auto mono text-[10px]">v{state.update.current}</span>{state.update.status === 'available' && <span className="size-1.5 rounded-full bg-primary" />}</button></div>
    </aside>
    <main className="flex min-w-0 flex-1 flex-col">
      <header className="drag flex h-14 shrink-0 items-center justify-between border-b px-7"><div className="flex items-center gap-2 text-xs text-muted-foreground"><Layers3 className="size-3.5" />Workspace<ChevronRight className="size-3" /><span className="text-foreground">{project?.name ?? 'Welcome'}</span></div><div className="flex items-center gap-4"><button className="no-drag text-muted-foreground hover:text-foreground" title={state.settings.appearance === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'} aria-label={state.settings.appearance === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'} onClick={() => run(() => window.devenv.saveSettings({ ...state.settings, appearance: state.settings.appearance === 'dark' ? 'light' : 'dark' }))}>{state.settings.appearance === 'dark' ? <Sun className="size-4" /> : <Moon className="size-4" />}</button><span className="flex items-center gap-2 text-[11px] text-muted-foreground"><span className={cn('size-1.5 rounded-full', active ? 'bg-emerald-500' : 'bg-slate-300')} />{active ? `${session.project.name} active` : 'No active session'}</span></div></header>
      {problem && <div role="alert" className="mx-7 mt-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-800"><CircleAlert className="mt-0.5 size-4 shrink-0" /><p className="break-all">{problem}</p></div>}
      {state.scanErrors.length > 0 && <details className="mx-7 mt-3 text-xs text-amber-700"><summary>{state.scanErrors.length} folder scanning issue(s)</summary><pre className="max-h-24 overflow-auto whitespace-pre-wrap">{state.scanErrors.join('\n')}</pre></details>}
      {state.update.status === 'available' && <button onClick={() => setSettings(true)} className="mx-7 mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-left text-xs text-primary">Devenv {state.update.latest} is available. Open Settings to update →</button>}
      {!project ? <div className="flex flex-1 flex-col items-center justify-center px-10 pb-16 text-center"><div className="mb-6 flex size-16 items-center justify-center rounded-2xl border bg-[var(--surface)] shadow-sm"><Layers3 className="size-7 text-primary" /></div><h1 className="text-2xl font-semibold tracking-tight">Your projects, in one place.</h1><p className="mt-3 max-w-sm text-sm leading-6 text-muted-foreground">Add a folder containing your projects. Devenv finds their <span className="mono text-xs">devenv.toml</span> files, wherever they live.</p><Button className="mt-6" onClick={() => run(() => window.devenv.addFolder())}><FolderPlus />Add search folder</Button><div className="mt-8 rounded-lg border bg-[var(--surface)] px-5 py-4 text-left"><p className="mb-2 text-xs font-medium">A small file. A complete session.</p><pre className="mono text-[11px] leading-5 text-muted-foreground">{'version = 1\nname = "My project"\n\n[services.api]\ncwd = "./api"\ncommand = "npm run dev"\nports = [3100]'}</pre></div></div> : <>
        <section className="shrink-0 px-7 pb-5 pt-7"><div className="flex items-start justify-between gap-5"><div><div className="mb-2 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[.16em] text-muted-foreground"><span className="h-px w-4 bg-primary" />Local environment</div><h1 className="text-[29px] font-semibold leading-tight tracking-tight">{project.name}</h1><p title={project.path} className="mono mt-2 max-w-[440px] truncate text-[11px] text-muted-foreground">{shortPath(project.path)}</p></div><div className="flex items-center gap-2 pt-5"><Button variant="outline" size="sm" onClick={() => setEditingConfig(true)}><FileCode2 />Config</Button><Button variant="outline" size="sm" title="Show devenv.toml in Finder" onClick={() => run(() => window.devenv.openConfigFinder(project.id))}><FolderOpen />Finder</Button><Button variant="outline" size="sm" title="Open a new Ghostty window in the config folder" onClick={() => run(() => window.devenv.openConfigTerminal(project.id))}><Terminal />Terminal</Button>{running ? <Button variant="outline" size="sm" disabled={session.status === 'stopping'} onClick={() => run(() => window.devenv.stop())}><Square className="size-3" />{session.status === 'starting' ? 'Cancel startup' : 'Stop session'}</Button> : <Button size="sm" disabled={busy || transitioning || !!project.error} onClick={() => run(() => window.devenv.start(project.id))}>{active ? <ArrowRightLeft /> : <Play />}{active ? 'Switch here' : 'Start session'}</Button>}</div></div>
          <div className="mt-6 grid grid-cols-3 overflow-hidden rounded-lg border bg-[var(--surface)]"><div className="px-4 py-3"><p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Session</p><p className="mt-1.5 flex items-center gap-2 text-sm font-medium capitalize"><Radio className={cn('size-3.5', running ? 'text-emerald-600' : 'text-slate-400')} />{current ? session.status : 'Stopped'}</p></div><div className="border-x px-4 py-3"><p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Services running</p><p className="mono mt-1.5 text-sm">{current ? count : 0}<span className="text-muted-foreground"> / {services.filter(s => s.enabled && s.mode !== 'task').length}</span></p></div><div className="px-4 py-3"><p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Environment</p><p className="mt-1.5 flex items-center gap-2 text-sm"><Circle className="size-3 text-primary" />One project at a time</p></div></div>
        </section>
        <Tabs value={view} onValueChange={value => setView(value as 'services' | 'terminal')} className="mx-7 mb-5 mt-1 flex min-h-0 flex-1 flex-col">
          <TabsList className="w-fit shrink-0"><TabsTrigger value="services">Services</TabsTrigger><TabsTrigger value="terminal">Terminal</TabsTrigger></TabsList>
          <TabsContent value="services" className="mt-3 min-h-0 flex-1 overflow-auto">
        {snapshot?.error ? <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800"><strong>Check your configuration</strong><pre className="mt-2 whitespace-pre-wrap text-xs">{snapshot.error}</pre></div> : <section className="overflow-auto rounded-lg border bg-[var(--surface)]">
          <div className="sticky top-0 z-10 flex items-center justify-between border-b bg-[var(--surface)] px-4 py-2.5"><h2 className="text-xs font-semibold">Services</h2>{missingServices ? <Button size="sm" variant="outline" disabled={busy || transitioning} onClick={() => run(() => window.devenv.start(project.id))}><Play />Start remaining</Button> : <span className="text-[10px] text-muted-foreground">Started in dependency order</span>}</div>
          <table className="w-full text-left text-xs"><thead className="bg-[var(--surface-hover)] text-[10px] font-medium uppercase tracking-wider text-muted-foreground"><tr><th className="px-4 py-2 font-medium">Service / command</th><th className="px-2 py-2 font-medium">Port</th><th className="px-2 py-2 font-medium">Status</th><th className="w-28 px-2"><span className="sr-only">Actions</span></th></tr></thead><tbody>
            {services.map(service => {
              const serviceState = current ? session.services.find(s => s.name === service.name) : undefined;
              return <tr key={service.name} className={cn('border-t hover:bg-[var(--surface-hover)]', !service.enabled && 'opacity-45')}><td className="px-4 py-2.5"><button className="max-w-full text-left" onClick={() => { setServiceFilter(service.name); setView('terminal'); }}><span className="flex items-center gap-2 font-medium"><Terminal className="size-3.5 text-muted-foreground" />{service.name}{service.mode === 'task' && <span className="font-normal text-muted-foreground">· task</span>}</span><span title={`${service.cwd}\n${service.command}`} className="mono mt-1 block max-w-[330px] truncate text-[10px] text-muted-foreground">{service.command}</span></button>{serviceState?.error && <p className="mt-1 max-w-[360px] break-words text-[10px] text-destructive">{serviceState.error}</p>}</td><td className="mono px-2 text-[11px] text-muted-foreground">{service.ports.join(', ') || '—'}</td><td className="px-2">{service.enabled ? <Status status={serviceState?.status ?? 'stopped'} /> : <span className="text-[11px] text-muted-foreground">Disabled</span>}</td><td className="px-2">{service.enabled && (() => { const status = serviceState?.status ?? 'stopped'; const disabled = busy || transitioning || ['starting', 'stopping'].includes(status); return running && ['running', 'ready'].includes(status) ? <Button size="sm" variant="ghost" aria-label={`Stop ${service.name}`} title={`Stop ${service.name} and services that depend on it`} disabled={disabled} onClick={() => run(() => window.devenv.stopService(project.id, service.name))}><Square />Stop</Button> : running && status === 'completed' ? <Button size="sm" variant="ghost" aria-label={`Run ${service.name} again`} disabled={disabled} onClick={() => run(() => window.devenv.restart(service.name))}><RefreshCw />Run again</Button> : <Button size="sm" variant="ghost" aria-label={`${status === 'failed' ? 'Retry' : 'Start'} ${service.name}`} title={active && !current ? `Switch to ${project.name} and start ${service.name}` : `Start ${service.name} and its dependencies`} disabled={disabled || !!project.error} onClick={() => run(() => window.devenv.startService(project.id, service.name))}><Play />{status === 'failed' ? 'Retry' : 'Start'}</Button>; })()}</td></tr>;
            })}
          </tbody></table>
        </section>}
          </TabsContent>
          <TabsContent value="terminal" className="mt-3 flex min-h-0 flex-1 flex-col">
        <section className="terminal-panel flex min-h-[130px] flex-1 flex-col overflow-hidden rounded-lg border border-[#404651] bg-[#282C34] text-[var(--terminal-foreground)]">
          <div className="flex shrink-0 items-center justify-between gap-2 border-b border-white/8 bg-[#303641] px-4 py-2.5"><div className="flex items-center gap-2"><Terminal className="size-3.5 text-[var(--terminal-accent)]" /><h2 className="text-xs font-medium">Console</h2><select aria-label="Filter logs by service" value={serviceFilter} onChange={e => setServiceFilter(e.target.value)} className="ml-2 rounded border border-white/10 bg-[#383E4A] px-2 py-1 text-[10px] text-[var(--terminal-foreground)]"><option value="">All services</option>{services.map(s => <option key={s.name}>{s.name}</option>)}</select></div><div className="flex items-center gap-3 text-[var(--terminal-foreground)]"><button title={following ? 'Pause logs' : 'Follow logs'} aria-label={following ? 'Pause logs' : 'Follow logs'} onClick={() => setFollowing(!following)}>{following ? <Pause className="size-3.5" /> : <ArrowDownToLine className="size-3.5" />}</button><button title="Copy visible logs" aria-label="Copy visible logs" onClick={() => { void navigator.clipboard.writeText(visibleLogs.map(e => clean(e.text)).join('')).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }); }}>{copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}</button><button disabled={!running} onClick={() => run(() => window.devenv.openTerminal())} className="flex items-center gap-1.5 text-[10px] disabled:opacity-30">Open in Ghostty<ExternalLink className="size-3" /></button></div></div>
          <div className="flex shrink-0 items-center gap-2 border-b border-white/5 px-4 py-1.5"><Search className="size-3 text-[#7F8A99]" /><input aria-label="Search logs" value={textFilter} onChange={e => setTextFilter(e.target.value)} placeholder="Filter output…" className="w-full bg-transparent text-[10px] text-[var(--terminal-foreground)] outline-none placeholder:text-[#7F8A99]" /></div>
          <div className="console mono min-h-0 flex-1 overflow-auto px-4 py-3 text-[10px] leading-[1.8]">
            {!current || !visibleLogs.length ? <div className="flex h-full min-h-10 items-center justify-center gap-2 text-[#7F8A99]"><span>›</span>{running ? 'Waiting for service output…' : 'Start a session to see your service output here.'}</div> : visibleLogs.map(entry => <div key={entry.seq} className="flex items-start gap-3"><span className="shrink-0 select-none text-[#7F8A99]">{entry.time.slice(11, 19)}</span><span className="w-16 shrink-0 truncate text-[var(--terminal-secondary)]" title={entry.service}>{entry.service === '_session' ? 'devenv' : entry.service}</span><span className={cn('min-w-0 whitespace-pre-wrap break-all', entry.stream === 'stderr' && 'text-[#e8aa91]', entry.stream === 'system' && 'text-[#7F8A99]')}>{clean(entry.text)}</span></div>)}<div ref={bottom} />
          </div>
        </section>
          </TabsContent>
        </Tabs>
      </>}
      <footer className="flex h-8 shrink-0 items-center justify-between border-t px-7 text-[10px] text-muted-foreground"><span>Local commands. A shared routine.</span><span>{state.scanning ? 'Discovering projects…' : `${state.settings.roots.length} search folder${state.settings.roots.length === 1 ? '' : 's'}`}<span className="mx-2 opacity-30">|</span>macOS</span></footer>
    </main>
    {editingConfig && project && <ConfigEditor key={project.id} project={project} open={editingConfig} onClose={() => setEditingConfig(false)} active={!!running} appearance={state.settings.appearance} />}
    {settings && <Settings state={state} open={settings} setOpen={setSettings} run={run} />}
  </div>;
}
