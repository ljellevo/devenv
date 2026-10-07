import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { AppState } from '../shared/types';
export function WslFolderPicker({ state, run }: { state: AppState; run(action: () => Promise<unknown>): void }) {
  const [items, setItems] = useState<Array<{ name: string; version: number }>>([]);
  const [distribution, setDistribution] = useState('');
  const [path, setPath] = useState('');
  const [directories, setDirectories] = useState<string[]>([]);
  const browse = async (name: string, directory?: string) => {
    const result = await window.devenv.wslDirectories(name, directory);
    setDistribution(name); setPath(result.path); setDirectories(result.directories);
  };
  return <section className="space-y-2 rounded border p-3">
    <Button variant="outline" onClick={() => run(async () => setItems(await window.devenv.wslDistributions()))}>Choose WSL folder</Button>
    {items.length > 0 && <><select aria-label="WSL distribution" value={distribution} onChange={event => run(() => browse(event.target.value))}><option value="" disabled>Choose a distribution</option>{items.map(item => <option key={item.name} value={item.name} disabled={item.version !== 2}>{item.name} · WSL {item.version}</option>)}</select>
      {distribution && <><Input aria-label="WSL directory" value={path} onChange={event => setPath(event.target.value)} /><div className="flex gap-2"><Button variant="outline" onClick={() => run(() => browse(distribution, path))}>Browse</Button><Button onClick={() => run(() => window.devenv.addWslFolder(distribution, path))}>Add WSL folder</Button></div><div className="max-h-32 overflow-auto"><button className="block" onClick={() => run(() => browse(distribution, path + '/..'))}>..</button>{directories.map(name => <button key={name} className="block" onClick={() => run(() => browse(distribution, path + '/' + name))}>{name}</button>)}</div></>}
    </>}
    {(state.settings.searchRoots ?? []).filter(root => root.target.kind === 'wsl').map((root, index) => <div className="flex items-center gap-2" key={index}><span className="min-w-0 flex-1 truncate text-xs">{root.target.kind === 'wsl' && root.target.distribution}: {root.path}</span><Button variant="ghost" onClick={() => run(() => window.devenv.saveSettings({ ...state.settings, searchRoots: state.settings.searchRoots!.filter(item => item !== root) }))}>Remove</Button></div>)}
  </section>;
}
