import type { Project, ProjectFolder } from './types';

export type TreeEntry = { kind: 'folder' | 'project'; id: string };
export type DropTarget = { entry: TreeEntry; position: 'before' | 'after' | 'inside' } | { position: 'root-end' };
export interface TreeLayout { folders: ProjectFolder[]; assignments: Record<string, string>; order: Record<string, string[]> }

export const treeKey = (entry: TreeEntry) => `${entry.kind === 'folder' ? 'f' : 'p'}:${entry.id}`;
export const groupKey = (parentId: string | null) => parentId ?? 'root';

export function orderedChildren(layout: TreeLayout, projects: Project[], parentId: string | null): TreeEntry[] {
  const folderIds = new Set(layout.folders.map(folder => folder.id));
  const entries: TreeEntry[] = [
    ...layout.folders.filter(folder => folder.parentId === parentId).map(folder => ({ kind: 'folder' as const, id: folder.id })),
    ...projects.filter(project => (folderIds.has(layout.assignments[project.id]) ? layout.assignments[project.id] : null) === parentId).map(project => ({ kind: 'project' as const, id: project.id })),
  ];
  const ranks = new Map((layout.order[groupKey(parentId)] ?? []).map((key, index) => [key, index]));
  return entries.sort((a, b) => (ranks.get(treeKey(a)) ?? Infinity) - (ranks.get(treeKey(b)) ?? Infinity));
}

export function dropEntry(layout: TreeLayout, projects: Project[], dragged: TreeEntry, target: DropTarget): TreeLayout | null {
  const draggedKey = treeKey(dragged);
  const draggedFolder = dragged.kind === 'folder' ? layout.folders.find(folder => folder.id === dragged.id) : undefined;
  if (dragged.kind === 'folder' && !draggedFolder) return null;
  if (dragged.kind === 'project' && !projects.some(project => project.id === dragged.id)) return null;
  let parentId: string | null;
  if (target.position === 'root-end') parentId = null;
  else {
    if (treeKey(target.entry) === draggedKey) return null;
    if (target.entry.kind === 'folder') {
      const folder = layout.folders.find(item => item.id === target.entry.id);
      if (!folder) return null;
      parentId = target.position === 'inside' ? folder.id : folder.parentId;
    } else {
      if (target.position === 'inside' || !projects.some(project => project.id === target.entry.id)) return null;
      const assigned = layout.assignments[target.entry.id];
      parentId = layout.folders.some(folder => folder.id === assigned) ? assigned : null;
    }
  }
  if (draggedFolder) {
    let cursor = parentId;
    while (cursor) {
      if (cursor === draggedFolder.id) return null;
      cursor = layout.folders.find(folder => folder.id === cursor)?.parentId ?? null;
    }
  }
  const sourceParent = draggedFolder?.parentId ?? (layout.folders.some(folder => folder.id === layout.assignments[dragged.id]) ? layout.assignments[dragged.id] : null);
  const order = { ...layout.order };
  const sourceKey = groupKey(sourceParent);
  const destinationKey = groupKey(parentId);
  order[sourceKey] = orderedChildren(layout, projects, sourceParent).map(treeKey).filter(key => key !== draggedKey);
  const destination = sourceKey === destinationKey ? [...order[sourceKey]] : orderedChildren(layout, projects, parentId).map(treeKey).filter(key => key !== draggedKey);
  let index = destination.length;
  if (target.position !== 'root-end' && target.position !== 'inside') {
    index = destination.indexOf(treeKey(target.entry));
    if (index < 0) return null;
    if (target.position === 'after') index++;
  }
  destination.splice(index, 0, draggedKey);
  order[destinationKey] = destination;
  return {
    folders: draggedFolder ? layout.folders.map(folder => folder.id === dragged.id ? { ...folder, parentId } : folder) : layout.folders,
    assignments: dragged.kind === 'project' ? (() => { const next = { ...layout.assignments }; if (parentId) next[dragged.id] = parentId; else delete next[dragged.id]; return next; })() : layout.assignments,
    order,
  };
}
