import { useState } from 'react';
import { FolderPlus, Trash2, Download, RefreshCw, Check, Github, Sun, Moon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { AppState } from '../shared/types';

export function Settings({ state, open, setOpen, run }: { state: AppState; open: boolean; setOpen(value: boolean): void; run(action: () => Promise<unknown>): void }) {
  const [shell, setShell] = useState(state.settings.shell);
  const [repo, setRepo] = useState(state.settings.releaseRepo);
  const [exclusions, setExclusions] = useState(state.settings.exclusions.join(', '));
  const [token, setToken] = useState('');
  const [confirmInstall, setConfirmInstall] = useState(false);
  const update = state.update;
  return <Dialog open={open} onOpenChange={setOpen}><DialogContent>
    <div><DialogTitle>Settings</DialogTitle><DialogDescription className="mt-2">Your workspace, terminal environment, and app updates.</DialogDescription></div>
    <Tabs defaultValue="workspace"><TabsList className="w-full"><TabsTrigger value="workspace" className="flex-1">Workspace</TabsTrigger><TabsTrigger value="updates" className="flex-1">Updates {update.status === 'available' && '·'}</TabsTrigger></TabsList>
      <TabsContent value="workspace" className="space-y-5">
        <section><h3 className="mb-3 font-medium">Appearance</h3><div className="inline-flex rounded-lg border bg-muted p-1" role="group" aria-label="Appearance"><Button size="sm" variant={state.settings.appearance === "light" ? "secondary" : "ghost"} aria-pressed={state.settings.appearance === "light"} onClick={() => run(() => window.devenv.saveSettings({ ...state.settings, appearance: "light" }))}><Sun />Light</Button><Button size="sm" variant={state.settings.appearance === "dark" ? "secondary" : "ghost"} aria-pressed={state.settings.appearance === "dark"} onClick={() => run(() => window.devenv.saveSettings({ ...state.settings, appearance: "dark" }))}><Moon />Dark</Button></div><p className="mt-2 text-xs text-muted-foreground">The terminal always uses its dark theme.</p></section>
        <section><div className="mb-3 flex items-center justify-between"><h3 className="font-medium">Search folders</h3><Button size="sm" variant="outline" onClick={() => run(() => window.devenv.addFolder())}><FolderPlus />Add folder</Button></div>
          {state.settings.roots.length === 0 && <p className="text-sm text-muted-foreground">Add the folder that contains your projects.</p>}
          {state.settings.roots.map(root => <div key={root} className="mb-2 flex items-center gap-2 rounded-md border bg-[var(--surface)] px-3 py-1"><span className="mono flex-1 truncate text-xs" title={root}>{root}</span><Button size="icon" variant="ghost" aria-label={`Remove ${root}`} onClick={() => run(() => window.devenv.saveSettings({ ...state.settings, roots: state.settings.roots.filter(r => r !== root) }))}><Trash2 /></Button></div>)}
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">Looks for devenv.toml in subfolders. Dependency folders, caches, and build outputs are skipped.</p>
        </section>
        <label className="block space-y-2"><span className="font-medium">Additional excluded folder names</span><Input value={exclusions} onChange={e => setExclusions(e.target.value)} placeholder="archive, backups" /></label>
        <label className="block space-y-2"><span className="font-medium">Shell</span><Input value={shell} onChange={e => setShell(e.target.value)} /><span className="block text-xs text-muted-foreground">Your login environment supplies PATH. Stop the active session before changing shells.</span></label>
        <Button onClick={() => run(() => window.devenv.saveSettings({ ...state.settings, shell, exclusions: exclusions.split(',').map(s => s.trim()).filter(Boolean) }))}><Check />Save workspace settings</Button>
      </TabsContent>
      <TabsContent value="updates" className="space-y-5">
        <div className="rounded-lg border bg-[var(--surface)] p-4"><div className="flex items-center justify-between"><div><div className="font-medium">Devenv</div><div className="mt-1 text-xs text-muted-foreground">Installed version {update.current}</div>{update.checkedAt && <div className="mt-1 text-xs text-muted-foreground">Last checked {new Date(update.checkedAt).toLocaleString()}</div>}</div><Github className="size-5 text-muted-foreground" /></div></div>
        <label className="block space-y-2"><span className="font-medium">GitHub release repository</span><div className="flex gap-2"><Input value={repo} onChange={e => setRepo(e.target.value)} placeholder="owner/repository" /><Button variant="outline" onClick={() => run(() => window.devenv.saveSettings({ ...state.settings, releaseRepo: repo }))}>Save</Button></div></label>
        <label className="block space-y-2"><span className="font-medium">Private repository token {state.hasToken && <span className="text-xs font-normal text-primary">· saved</span>}</span><div className="flex gap-2"><Input type="password" autoComplete="off" value={token} onChange={e => setToken(e.target.value)} placeholder={state.hasToken ? 'Replace saved token' : 'Optional for public repositories'} /><Button variant="outline" onClick={() => run(async () => { await window.devenv.saveToken(token); setToken(''); })}>{token ? 'Save' : 'Clear'}</Button></div><span className="block text-xs leading-relaxed text-muted-foreground">Use a fine-grained token with read-only Contents access to this repository. Stored locally in a private file, outside your projects, as in Oppskriftsbanken.</span></label>
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
  </DialogContent></Dialog>;
}
