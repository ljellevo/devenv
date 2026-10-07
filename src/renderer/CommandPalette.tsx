import { CircleHelp, FolderPlus, FolderSearch, Layers3, Settings2 } from 'lucide-react';
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator, CommandShortcut } from '@/components/ui/command';
import { orderedChildren } from '../shared/project-tree';
import type { AppState, Project } from '../shared/types';

function orderedProjects(state: AppState): Project[] {
  const layout = { folders: state.settings.projectFolders ?? [], assignments: state.settings.projectFolderAssignments ?? {}, order: state.settings.projectTreeOrder ?? {} };
  const byId = new Map(state.projects.map(project => [project.id, project]));
  const result: Project[] = [];
  function visit(parentId: string | null) {
    for (const entry of orderedChildren(layout, state.projects, parentId)) {
      if (entry.kind === 'folder') visit(entry.id);
      else { const project = byId.get(entry.id); if (project) result.push(project); }
    }
  }
  visit(null);
  const activeId = state.session && !['stopped', 'failed'].includes(state.session.status) ? state.session.project.id : undefined;
  return activeId ? [...result.filter(project => project.id === activeId), ...result.filter(project => project.id !== activeId)] : result;
}

export function CommandPalette({ state, open, setOpen, onProject, onCreate, onAddFolder, onHelp, onSettings }: {
  state: AppState; open: boolean; setOpen(open: boolean): void; onProject(id: string): void;
  onCreate(): void; onAddFolder(): void; onHelp(): void; onSettings(): void;
}) {
  const activeId = state.session && !['stopped', 'failed'].includes(state.session.status) ? state.session.project.id : undefined;
  const choose = (action: () => void) => { setOpen(false); action(); };
  return <CommandDialog open={open} onOpenChange={setOpen}>
    <CommandInput autoFocus placeholder="Search projects or commands…" aria-label="Search projects and commands" />
    <CommandList>
      <CommandEmpty>No matching projects or commands.</CommandEmpty>
      <CommandGroup heading="Create"><CommandItem value="Add a project" onSelect={() => choose(onCreate)}><FolderPlus className="size-4 text-primary" />Add a project</CommandItem></CommandGroup>
      <CommandSeparator />
      <CommandGroup heading="Projects">{orderedProjects(state).map(project => {
        const serviceCount = project.services.filter(service => service.enabled).length;
        const status = project.draft ? 'Draft' : project.id === activeId ? state.session?.status === 'degraded' ? 'Degraded' : state.session?.status === 'starting' ? 'Starting' : state.session?.status === 'stopping' ? 'Stopping' : 'Running' : 'Stopped';
        return <CommandItem key={project.id} value={`${project.name} ${project.path}`} onSelect={() => choose(() => onProject(project.id))}><Layers3 className="size-4 shrink-0 text-muted-foreground" /><span className="min-w-0 flex-1"><span className="block truncate text-sm">{project.name}</span><span className="block text-[11px] text-muted-foreground">{status} · {serviceCount} service{serviceCount === 1 ? '' : 's'}</span></span>{project.id === activeId && <CommandShortcut>Active</CommandShortcut>}</CommandItem>;
      })}</CommandGroup>
      <CommandSeparator />
      <CommandGroup heading="More"><CommandItem value="Add search folder" onSelect={() => choose(onAddFolder)}><FolderSearch className="size-4 text-muted-foreground" />Add search folder</CommandItem><CommandItem value="Help documentation" onSelect={() => choose(onHelp)}><CircleHelp className="size-4 text-muted-foreground" />Help</CommandItem><CommandItem value="Settings preferences updates" onSelect={() => choose(onSettings)}><Settings2 className="size-4 text-muted-foreground" />Settings{state.update.status === 'available' && <span className="ml-auto size-1.5 rounded-full bg-primary" />}</CommandItem></CommandGroup>
    </CommandList>
  </CommandDialog>;
}
