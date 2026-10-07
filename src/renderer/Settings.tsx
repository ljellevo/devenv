import { WslFolderPicker } from './WslFolderPicker';
import { useState } from 'react';
import { FolderPlus, Trash2, Download, RefreshCw, Check, Github, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { appearanceOptions } from './appearance';
import { TerminalPicker } from './terminals';
import type { AppState } from '../shared/types';

export type SettingsTab = 'general' | 'workspace' | 'updates';

export function Settings({ state, open, setOpen, tab, setTab, run }: { state: AppState; open: boolean; setOpen(value: boolean): void; tab: SettingsTab; setTab(value: SettingsTab): void; run(action: () => Promise<unknown>): void }) {
  const [shell, setShell] = useState(state.settings.shell);
  const [repo, setRepo] = useState(state.settings.releaseRepo);
  const [exclusions, setExclusions] = useState(state.settings.exclusions.join(', '));
  const [confirmInstall, setConfirmInstall] = useState(false);
  const update = state.update;
  const nextExclusions = exclusions.split(',').map(s => s.trim()).filter(Boolean);
  const exclusionsDirty = nextExclusions.join('\n') !== state.settings.exclusions.join('\n');
  // Pickers and folder changes save immediately; only typed fields can hold unsaved edits.
  const dirty = shell !== state.settings.shell || exclusionsDirty || repo !== state.settings.releaseRepo;
  const [confirmClose, setConfirmClose] = useState(false);
  return <Dialog open={open} onOpenChange={value => { if (!value && dirty) setConfirmClose(true); else setOpen(value); }}><DialogContent className="max-h-[calc(100vh-3rem)]">
    <div><DialogTitle>Settings</DialogTitle><DialogDescription className="mt-2">How Devenv looks and runs, where it finds projects, and app updates.</DialogDescription></div>
    <Tabs value={tab} onValueChange={value => setTab(value as SettingsTab)}><TabsList className="w-full"><TabsTrigger value="general" className="flex-1">General</TabsTrigger><TabsTrigger value="workspace" className="flex-1">Workspace</TabsTrigger><TabsTrigger value="updates" className="flex-1">Updates {update.status === 'available' && '·'}</TabsTrigger></TabsList>
      <TabsContent value="general" className="space-y-5">
        <section><h3 className="mb-3 font-medium">Appearance</h3><div className="inline-flex rounded-lg border bg-muted p-1" role="group" aria-label="Appearance">{appearanceOptions.map(({ value, label, icon: Icon }) => <Button key={value} size="sm" variant={state.settings.appearance === value ? "secondary" : "ghost"} aria-pressed={state.settings.appearance === value} onClick={() => run(() => window.devenv.saveSettings({ ...state.settings, appearance: value }))}><Icon />{label}</Button>)}</div><p className="mt-2 text-xs text-muted-foreground">System follows your system’s light or dark setting. The Terminal tab always uses its dark theme.</p></section>
        <section><h3 className="mb-3 font-medium">Terminal app</h3><TerminalPicker state={state} run={run} /><p className="mt-2 text-xs text-muted-foreground">Service logs and project folders open here.{state.settings.terminal === 'terminal' && state.hostPlatform !== 'windows' && ' Terminal opens one window per service.'}</p></section>
        <label className="block space-y-2"><span className="font-medium">Shell</span><div className="flex gap-2"><Input value={shell} onChange={e => setShell(e.target.value)} /><Button variant="outline" disabled={shell === state.settings.shell} onClick={() => run(() => window.devenv.saveSettings({ ...state.settings, shell }))}>Save</Button></div><span className="block text-xs text-muted-foreground">{state.hostPlatform === 'windows' ? 'Use pwsh.exe or powershell.exe; your PowerShell profile supplies PATH. WSL projects use their distribution’s shell.' : 'Your login environment supplies PATH.'} Stop the active session before changing shells.</span></label>
        <section><div className="flex items-center justify-between gap-3"><div><h3 className="font-medium">Tutorial</h3><p className="mt-1 text-xs text-muted-foreground">{state.settings.onboardingCompleted ? 'Show the introduction and folder setup again.' : 'The tutorial will show the next time Devenv launches.'}</p></div><Button size="sm" variant="outline" className="shrink-0" title="Show the introduction and folder setup again the next time Devenv launches" disabled={!state.settings.onboardingCompleted} onClick={() => run(() => window.devenv.saveSettings({ ...state.settings, onboardingCompleted: false }))}><RotateCcw />Reset tutorial</Button></div></section>
      </TabsContent>
      <TabsContent value="workspace" className="space-y-5">
        <section><div className="mb-3 flex items-center justify-between"><h3 className="font-medium">Search folders</h3><Button size="sm" variant="outline" onClick={() => run(() => window.devenv.addFolder())}><FolderPlus />Add folder</Button></div>
          {state.settings.roots.length === 0 && <p className="text-sm text-muted-foreground">Add the folder that contains your projects.</p>}
          {state.settings.roots.map(root => <div key={root} className="mb-2 flex items-center gap-2 rounded-md border bg-[var(--surface)] px-3 py-1"><span className="mono flex-1 truncate text-xs" title={root}>{root}</span><Button size="icon" variant="ghost" aria-label={`Remove ${root}`} onClick={() => run(() => window.devenv.saveSettings({ ...state.settings, roots: state.settings.roots.filter(r => r !== root) }))}><Trash2 /></Button></div>)}
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">Looks for devenv.toml in subfolders. Dependency folders, caches, and build outputs are skipped.</p>
        </section>
        {state.hostPlatform === 'windows' && <WslFolderPicker state={state} run={run} />}
        <label className="block space-y-2"><span className="font-medium">Additional excluded folder names</span><Input value={exclusions} onChange={e => setExclusions(e.target.value)} placeholder="archive, backups" /></label>
        <Button disabled={!exclusionsDirty} onClick={() => run(() => window.devenv.saveSettings({ ...state.settings, exclusions: nextExclusions }))}><Check />Save workspace settings</Button>
      </TabsContent>
      <TabsContent value="updates" className="space-y-5">
        <div className="rounded-lg border bg-[var(--surface)] p-4"><div className="flex items-center justify-between"><div><div className="font-medium">Devenv</div><div className="mt-1 text-xs text-muted-foreground">Installed version {update.current}</div>{update.checkedAt && <div className="mt-1 text-xs text-muted-foreground">Last checked {new Date(update.checkedAt).toLocaleString()}</div>}</div><Github className="size-5 text-muted-foreground" /></div></div>
        <label className="block space-y-2"><span className="font-medium">GitHub release repository</span><div className="flex gap-2"><Input value={repo} onChange={e => setRepo(e.target.value)} placeholder="owner/repository" /><Button variant="outline" onClick={() => run(() => window.devenv.saveSettings({ ...state.settings, releaseRepo: repo }))}>Save</Button></div></label>
        <div className="space-y-3 border-t pt-4">
          {update.status === 'available' && <p className="font-medium text-primary">Version {update.latest} is available</p>}
          {update.status === 'uptodate' && <p className="text-primary">You’re up to date.</p>}
          {update.message && <p className="text-sm text-destructive">{update.message}</p>}
          {update.notes && <pre className="max-h-32 overflow-auto whitespace-pre-wrap text-xs text-muted-foreground">{update.notes}</pre>}
          {update.status === 'downloading' && <div><div className="mb-2 text-xs">Downloading installer · {update.progress}%</div><progress className="h-2 w-full accent-[#00BB66]" value={update.progress} max={100} /></div>}
          <div className="flex gap-2"><Button variant="outline" disabled={['checking', 'downloading'].includes(update.status)} onClick={() => run(() => window.devenv.checkUpdate())}><RefreshCw className={update.status === 'checking' ? 'animate-spin' : ''} />Check for updates</Button>{['available', 'downloaded'].includes(update.status) && <Button onClick={() => setConfirmInstall(true)}><Download />Download & install</Button>}</div>
        </div>
      </TabsContent>
    </Tabs>
    <Dialog open={confirmInstall} onOpenChange={setConfirmInstall}><DialogContent><DialogTitle>Install the update</DialogTitle><DialogDescription>Devenv will download the installer, stop your active session, open the disk image, and quit. Drag the new app into Applications to finish the update. Your project data is preserved.</DialogDescription><div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setConfirmInstall(false)}>Cancel</Button><Button onClick={() => { setConfirmInstall(false); run(() => window.devenv.installUpdate()); }}>Download & install</Button></div></DialogContent></Dialog>
    <Dialog open={confirmClose} onOpenChange={setConfirmClose}><DialogContent><DialogTitle>Discard unsaved settings?</DialogTitle><DialogDescription>You have changes that have not been saved. Closing Settings will lose them.</DialogDescription><div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setConfirmClose(false)}>Keep editing</Button><Button variant="destructive" onClick={() => { setConfirmClose(false); setOpen(false); }}>Discard changes</Button></div></DialogContent></Dialog>
  </DialogContent></Dialog>;
}
