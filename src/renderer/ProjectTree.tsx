import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, ChevronRight, Folder, FolderPlus, Layers3, Pencil, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import type { Project, ProjectFolder, Settings } from '../shared/types';
import { dropEntry, groupKey, orderedChildren, treeKey, type DropTarget, type TreeEntry, type TreeLayout } from '../shared/project-tree';

type Editor = { kind: 'create'; parentId: string | null } | { kind: 'rename' | 'delete'; folder: ProjectFolder };

export function ProjectTree({ projects, settings, selectedId, activeId, activeStatus, search, onSelect, onDragChange, run }: {
  projects: Project[]; settings: Settings; selectedId?: string; activeId?: string; activeStatus?: string; search: string;
  onSelect(id: string): void; onDragChange?(dragging: boolean): void; run(action: () => Promise<unknown>): void;
}) {
  const folders = settings.projectFolders ?? [];
  const assignments = settings.projectFolderAssignments ?? {};
  const order = settings.projectTreeOrder ?? {};
  const layout: TreeLayout = { folders, assignments, order };
  const [collapsed, setCollapsed] = useState<string[]>([]);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [name, setName] = useState('');
  const [dragged, setDragged] = useState<TreeEntry | null>(null);
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null);
  const [pointerPosition, setPointerPosition] = useState<{ x: number; y: number } | null>(null);
  const dragMetrics = useRef({ offsetX: 0, offsetY: 0, width: 0 });
  const pointerCleanup = useRef<(() => void) | null>(null);
  const dragWasActive = useRef(false);
  const suppressClick = useRef(false);
  const query = search.trim().toLowerCase();
  useEffect(() => { if (dragWasActive.current !== !!dragged) { dragWasActive.current = !!dragged; onDragChange?.(!!dragged); } }, [dragged, onDragChange]);
  const matches = projects.filter(project => project.name.toLowerCase().includes(query));
  useEffect(() => () => pointerCleanup.current?.(), []);

  function save(nextFolders: ProjectFolder[], nextAssignments: Record<string, string>, nextOrder = order) {
    run(() => window.devenv.saveSettings({ ...settings, projectFolders: nextFolders, projectFolderAssignments: nextAssignments, projectTreeOrder: nextOrder }));
  }
  function create(parentId: string | null) { setName(''); setEditor({ kind: 'create', parentId }); }
  function rowTarget(rect: DOMRect, y: number, entry: TreeEntry): DropTarget {
    const ratio = (y - rect.top) / rect.height;
    return { entry, position: entry.kind === 'folder' && ratio > 0.25 && ratio < 0.75 ? 'inside' : ratio < 0.5 ? 'before' : 'after' };
  }
  function beginPointer(event: React.PointerEvent, entry: TreeEntry) {
    if (query || event.button !== 0 || event.pointerType === 'touch') return;
    pointerCleanup.current?.();
    const startX = event.clientX, startY = event.clientY, pointerId = event.pointerId;
    const source = event.currentTarget;
    const bounds = source.closest<HTMLElement>('[data-tree-kind]')?.getBoundingClientRect() ?? source.getBoundingClientRect();
    dragMetrics.current = { offsetX: event.clientX - bounds.left, offsetY: event.clientY - bounds.top, width: bounds.width };
    source.setPointerCapture(pointerId);
    const origin: DropTarget = { entry, position: 'after' };
    let draggingNow = false;
    let currentTarget: DropTarget = origin;
    const oldUserSelect = document.body.style.userSelect;
    const cleanup = () => {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
      document.removeEventListener('pointercancel', onCancel);
      window.removeEventListener('blur', onBlur);
      if (source.hasPointerCapture(pointerId)) source.releasePointerCapture(pointerId);
      document.body.style.userSelect = oldUserSelect;
      pointerCleanup.current = null;
    };
    const onMove = (pointer: PointerEvent) => {
      if (pointer.pointerId !== pointerId) return;
      if (!draggingNow && Math.hypot(pointer.clientX - startX, pointer.clientY - startY) < 5) return;
      pointer.preventDefault();
      if (!draggingNow) {
        draggingNow = true;
        document.body.style.userSelect = 'none';
        setDragged(entry);
        setDropTarget(origin);
      }
      setPointerPosition({ x: pointer.clientX, y: pointer.clientY });
      const hit = document.elementFromPoint(pointer.clientX, pointer.clientY) as HTMLElement | null;
      const preview = hit?.closest('[data-drop-preview]');
      if (preview) return;
      const row = hit?.closest<HTMLElement>('[data-tree-kind]');
      let target: DropTarget | null = null;
      if (row) {
        const candidate: TreeEntry = { kind: row.dataset.treeKind as TreeEntry['kind'], id: row.dataset.treeId! };
        target = treeKey(candidate) === treeKey(entry) ? origin : rowTarget(row.getBoundingClientRect(), pointer.clientY, candidate);
      } else if (hit?.closest('[data-tree-root-end]')) target = { position: 'root-end' };
      else {
        const nav = document.querySelector('nav[aria-label="Projects"]');
        const bounds = nav?.getBoundingClientRect();
        if (bounds && (pointer.clientX < bounds.left || pointer.clientX > bounds.right || pointer.clientY < bounds.top || pointer.clientY > bounds.bottom)) target = origin;
      }
      if (target && (target.position === 'root-end' || treeKey(target.entry) === treeKey(entry) || dropEntry(layout, projects, entry, target))) {
        currentTarget = target;
        setDropTarget(previous => JSON.stringify(previous) === JSON.stringify(target) ? previous : target);
      }
    };
    const onUp = (pointer: PointerEvent) => {
      if (pointer.pointerId !== pointerId) return;
      cleanup();
      if (draggingNow) {
        const next = dropEntry(layout, projects, entry, currentTarget);
        if (next) {
          save(next.folders, next.assignments, next.order);
          if (currentTarget.position === 'inside') { const folderId = currentTarget.entry.id; setCollapsed(ids => ids.filter(id => id !== folderId)); }
        }
        suppressClick.current = true;
        setTimeout(() => { suppressClick.current = false; }, 0);
        setDragged(null); setDropTarget(null); setPointerPosition(null);
      }
    };
    const onCancel = (pointer: PointerEvent) => { if (pointer.pointerId === pointerId) { cleanup(); setDragged(null); setDropTarget(null); setPointerPosition(null); } };
    const onBlur = () => { cleanup(); setDragged(null); setDropTarget(null); setPointerPosition(null); };
    document.addEventListener('pointermove', onMove, { passive: false });
    document.addEventListener('pointerup', onUp);
    document.addEventListener('pointercancel', onCancel);
    window.addEventListener('blur', onBlur);
    pointerCleanup.current = cleanup;
  }
  function projectDetails(project: Project) {
    const serviceCount = project.services.filter(service => service.enabled).length;
    const status = project.draft ? 'Draft' : activeId === project.id ? activeStatus === 'degraded' ? 'Degraded' : activeStatus === 'starting' ? 'Starting' : activeStatus === 'stopping' ? 'Stopping' : 'Running' : 'Stopped';
    return <><Layers3 className={cn('size-4 shrink-0', selectedId === project.id ? 'text-primary' : 'text-muted-foreground')} /><div className="min-w-0 flex-1"><div className="truncate text-[12px] font-medium">{project.name}</div><div className="mt-0.5 flex items-center gap-1 truncate text-[10px] text-muted-foreground"><span className={cn('size-1.5 shrink-0 rounded-full', status === 'Running' ? 'bg-emerald-500' : status === 'Degraded' ? 'bg-amber-500' : status === 'Starting' || status === 'Stopping' ? 'bg-sky-500' : 'bg-muted-foreground/50')} /><span>{`${status} · ${serviceCount} service${serviceCount === 1 ? '' : 's'}`}</span></div></div></>;
  }
  function dragRow(depth: number, target: DropTarget) {
    if (!dragged || !dropTarget || JSON.stringify(dropTarget) !== JSON.stringify(target)) return null;
    const project = dragged.kind === 'project' ? projects.find(item => item.id === dragged.id) : undefined;
    const folder = dragged.kind === 'folder' ? folders.find(item => item.id === dragged.id) : undefined;
    if (!project && !folder) return null;
    return <div role="presentation" data-drop-preview className={cn('my-1 flex items-center rounded-lg bg-[var(--surface)] opacity-50', project ? 'gap-2.5 px-2 py-2.5' : 'gap-1.5 py-2 pl-1')} style={{ marginLeft: depth * 13 }}>
      {project ? projectDetails(project) : <><span className="text-muted-foreground">{collapsed.includes(folder!.id) ? <ChevronRight className="size-3.5" /> : <ChevronDown className="size-3.5" />}</span><Folder className="size-3.5 shrink-0 text-primary" /><span className="truncate text-xs font-medium">{folder!.name}</span><span className="ml-auto pr-1 text-[10px] text-muted-foreground">{projects.filter(item => descendants(folder!.id).includes(assignments[item.id])).length}</span></>}
    </div>;
  }
  function floatingRow() {
    if (!dragged || !pointerPosition) return null;
    const project = dragged.kind === 'project' ? projects.find(item => item.id === dragged.id) : undefined;
    const folder = dragged.kind === 'folder' ? folders.find(item => item.id === dragged.id) : undefined;
    if (!project && !folder) return null;
    const { offsetX, offsetY, width } = dragMetrics.current;
    return createPortal(<div aria-hidden="true" className={cn('pointer-events-none fixed z-[100] flex items-center rounded-lg bg-[var(--surface)] opacity-75 shadow-lg', project ? 'gap-2.5 px-2 py-2.5' : 'gap-1.5 py-2 pl-1')} style={{ left: pointerPosition.x - offsetX, top: pointerPosition.y - offsetY, width }}>
      {project ? projectDetails(project) : <><span className="text-muted-foreground">{collapsed.includes(folder!.id) ? <ChevronRight className="size-3.5" /> : <ChevronDown className="size-3.5" />}</span><Folder className="size-3.5 shrink-0 text-primary" /><span className="truncate text-xs font-medium">{folder!.name}</span><span className="ml-auto pr-1 text-[10px] text-muted-foreground">{projects.filter(item => descendants(folder!.id).includes(assignments[item.id])).length}</span><FolderPlus className="size-3 text-muted-foreground" /><Pencil className="size-3 text-muted-foreground" /><Trash2 className="mr-1 size-3 text-muted-foreground" /></>}
    </div>, document.body);
  }
  function submitName() {
    const trimmed = name.trim();
    if (!trimmed || !editor || editor.kind === 'delete') return;
    if (editor.kind === 'create') {
      const id = crypto.randomUUID();
      save([...folders, { id, name: trimmed, parentId: editor.parentId }], assignments);
      if (editor.parentId) setCollapsed(ids => ids.filter(value => value !== editor.parentId));
    } else save(folders.map(folder => folder.id === editor.folder.id ? { ...folder, name: trimmed } : folder), assignments);
    setEditor(null);
  }
  function deleteFolder(folder: ProjectFolder) {
    const children = orderedChildren(layout, projects, folder.id).map(treeKey);
    const parentKey = groupKey(folder.parentId);
    const nextOrder = { ...order, [parentKey]: orderedChildren(layout, projects, folder.parentId).map(treeKey).flatMap(key => key === `f:${folder.id}` ? children : [key]) };
    delete nextOrder[folder.id];
    const nextFolders = folders.filter(item => item.id !== folder.id).map(item => item.parentId === folder.id ? { ...item, parentId: folder.parentId } : item);
    const nextAssignments = { ...assignments };
    for (const [projectId, folderId] of Object.entries(nextAssignments)) if (folderId === folder.id) {
      if (folder.parentId) nextAssignments[projectId] = folder.parentId;
      else delete nextAssignments[projectId];
    }
    save(nextFolders, nextAssignments, nextOrder);
    setEditor(null);
  }
  function descendants(folderId: string): string[] {
    return [folderId, ...folders.filter(folder => folder.parentId === folderId).flatMap(folder => descendants(folder.id))];
  }
  function projectRow(project: Project, depth: number) {
    const entry: TreeEntry = { kind: 'project', id: project.id };
    return <div key={project.id}>
      {dragRow(depth, { entry, position: 'before' })}
      <div data-tree-kind="project" data-tree-id={project.id} className={cn('group flex items-center rounded-lg', selectedId === project.id ? 'bg-[var(--surface)] shadow-xs ring-1 ring-black/4' : 'hover:bg-[var(--surface-hover)]', dragged?.kind === 'project' && dragged.id === project.id && 'h-0 overflow-hidden opacity-0 pointer-events-none ring-0 shadow-none')} style={{ marginLeft: depth * 13 }}>
      <button onPointerDown={event => beginPointer(event, entry)} onClick={() => { if (!suppressClick.current) onSelect(project.id); }} title={project.error} className="flex min-w-0 flex-1 cursor-grab items-center gap-2.5 px-2 py-2.5 text-left active:cursor-grabbing">
        {projectDetails(project)}
      </button>
      </div>
      {dragRow(depth, { entry, position: 'after' })}
    </div>;
  }
  function folderRow(folder: ProjectFolder, depth: number): React.ReactNode {
    const entry: TreeEntry = { kind: 'folder', id: folder.id };
    if (query && !matches.some(project => descendants(folder.id).includes(assignments[project.id]))) return null;
    const isOpen = !!query || !collapsed.includes(folder.id);
    const count = projects.filter(project => descendants(folder.id).includes(assignments[project.id])).length;
    return <div key={folder.id}>
      {dragRow(depth, { entry, position: 'before' })}
      <div data-tree-kind="folder" data-tree-id={folder.id} className={cn('group flex items-center rounded-md hover:bg-[var(--surface-hover)]', dropTarget?.position === 'inside' && treeKey(dropTarget.entry) === treeKey(entry) && 'bg-primary/10', dragged?.kind === 'folder' && dragged.id === folder.id && 'h-0 overflow-hidden opacity-0 pointer-events-none')} style={{ marginLeft: depth * 13 }}>
        <button aria-label={`${isOpen ? 'Collapse' : 'Expand'} ${folder.name}`} aria-expanded={isOpen} onPointerDown={event => beginPointer(event, entry)} onClick={() => { if (!suppressClick.current) setCollapsed(ids => isOpen ? [...ids, folder.id] : ids.filter(id => id !== folder.id)); }} className="flex min-w-0 flex-1 cursor-grab items-center gap-1.5 py-2 pl-1 text-left text-xs font-medium active:cursor-grabbing"><span className="text-muted-foreground">{isOpen ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}</span><Folder className="size-3.5 shrink-0 text-primary" /><span className="truncate">{folder.name}</span><span className="ml-auto pr-1 text-[10px] font-normal text-muted-foreground">{count}</span></button>
        <button aria-label={`New folder in ${folder.name}`} title="New subfolder" onClick={() => create(folder.id)} className="rounded p-1 text-muted-foreground opacity-0 hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100"><FolderPlus className="size-3" /></button>
        <button aria-label={`Rename ${folder.name}`} title="Rename folder" onClick={() => { setName(folder.name); setEditor({ kind: 'rename', folder }); }} className="rounded p-1 text-muted-foreground opacity-0 hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100"><Pencil className="size-3" /></button>
        <button aria-label={`Delete ${folder.name}`} title="Delete folder" onClick={() => setEditor({ kind: 'delete', folder })} className="mr-1 rounded p-1 text-muted-foreground opacity-0 hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100"><Trash2 className="size-3" /></button>
      </div>
      {dragRow(depth + 1, { entry, position: 'inside' })}
      {isOpen && !(dragged?.kind === 'folder' && dragged.id === folder.id) && <div className="space-y-1">{orderedChildren(layout, matches, folder.id).map(child => child.kind === 'folder' ? folderRow(folders.find(item => item.id === child.id)!, depth + 1) : projectRow(projects.find(project => project.id === child.id)!, depth + 1))}</div>}
      {dragRow(depth, { entry, position: 'after' })}
    </div>;
  }
  return <>
    <div className="mt-6 flex items-center justify-between px-5 text-[10px] font-semibold uppercase tracking-[.14em] text-muted-foreground"><span>Projects <span className="ml-1 opacity-60">{projects.length}</span></span><button title="New project folder" aria-label="New project folder" onClick={() => create(null)}><FolderPlus className="size-3.5" /></button></div>
    <nav aria-label="Projects" className="mt-3 min-h-0 flex-1 space-y-1 overflow-auto px-3">
      {orderedChildren(layout, matches, null).map(child => child.kind === 'folder' ? folderRow(folders.find(item => item.id === child.id)!, 0) : projectRow(projects.find(project => project.id === child.id)!, 0))}
      {dragged && <div data-tree-root-end className="min-h-8">{dragRow(0, { position: 'root-end' })}</div>}
      {query && matches.length === 0 && <p className="px-2 py-4 text-xs text-muted-foreground">No matching projects.</p>}
    </nav>
    {floatingRow()}
    <Dialog open={!!editor} onOpenChange={open => { if (!open) setEditor(null); }}><DialogContent>
      <DialogTitle>{editor?.kind === 'create' ? 'New project folder' : editor?.kind === 'rename' ? 'Rename folder' : 'Delete folder'}</DialogTitle>
      {editor?.kind === 'delete' ? <><DialogDescription>Projects in {editor.folder.name} will move to its parent folder. Subfolders will stay organized.</DialogDescription><div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setEditor(null)}>Cancel</Button><Button variant="destructive" onClick={() => deleteFolder(editor.folder)}>Delete folder</Button></div></> : <><DialogDescription>Folders organize projects in Devenv without moving files on disk.</DialogDescription><Input autoFocus aria-label="Folder name" placeholder="Folder name" value={name} onChange={event => setName(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') submitName(); }} /><div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setEditor(null)}>Cancel</Button><Button disabled={!name.trim()} onClick={submitName}>Save folder</Button></div></>}
    </DialogContent></Dialog>
  </>;
}
