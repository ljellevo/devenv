import { describe, expect, it } from 'vitest';
import { dropEntry, orderedChildren, treeKey, type TreeLayout } from '../src/shared/project-tree';
import type { Project } from '../src/shared/types';

const project = (id: string): Project => ({ id, name: id, path: `/tmp/${id}/devenv.toml`, services: [] });
const projects = [project('intivo'), project('dealroom'), project('mekle')];
const folders = [
  { id: 'clients', name: 'Clients', parentId: null },
  { id: 'active', name: 'Active', parentId: 'clients' },
  { id: 'internal', name: 'Internal', parentId: null },
];
const layout: TreeLayout = { folders, assignments: { intivo: 'active' }, order: {} };
const keys = (state: TreeLayout, parentId: string | null) => orderedChildren(state, projects, parentId).map(treeKey);

describe('project tree ordering', () => {
  it('reorders root projects and keeps the order when discovered projects arrive in a different order', () => {
    const next = dropEntry(layout, projects, { kind: 'project', id: 'mekle' }, { entry: { kind: 'project', id: 'dealroom' }, position: 'before' })!;
    expect(keys(next, null)).toEqual(['f:clients', 'f:internal', 'p:mekle', 'p:dealroom']);
    expect(orderedChildren(next, [...projects].reverse(), null).map(treeKey)).toEqual(keys(next, null));
  });

  it('moves a project into a folder and allows ordering it beside a sibling', () => {
    const moved = dropEntry(layout, projects, { kind: 'project', id: 'dealroom' }, { entry: { kind: 'folder', id: 'active' }, position: 'inside' })!;
    expect(moved.assignments.dealroom).toBe('active');
    expect(keys(moved, 'active')).toEqual(['p:intivo', 'p:dealroom']);
    const reordered = dropEntry(moved, projects, { kind: 'project', id: 'dealroom' }, { entry: { kind: 'project', id: 'intivo' }, position: 'before' })!;
    expect(keys(reordered, 'active')).toEqual(['p:dealroom', 'p:intivo']);
  });

  it('nests folders but rejects dropping a folder into its descendant', () => {
    expect(dropEntry(layout, projects, { kind: 'folder', id: 'clients' }, { entry: { kind: 'folder', id: 'active' }, position: 'inside' })).toBeNull();
    const next = dropEntry(layout, projects, { kind: 'folder', id: 'internal' }, { entry: { kind: 'folder', id: 'clients' }, position: 'inside' })!;
    expect(next.folders.find(folder => folder.id === 'internal')?.parentId).toBe('clients');
    expect(keys(next, 'clients')).toEqual(['f:active', 'f:internal']);
  });

  it('moves a nested project back to the root end', () => {
    const next = dropEntry(layout, projects, { kind: 'project', id: 'intivo' }, { position: 'root-end' })!;
    expect(next.assignments.intivo).toBeUndefined();
    expect(keys(next, null)).toEqual(['f:clients', 'f:internal', 'p:dealroom', 'p:mekle', 'p:intivo']);
  });
});
