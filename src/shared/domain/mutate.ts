import type {
  CollectionName,
  FileEntry,
  IsoDate,
  Project,
  Settings,
  Task,
  Workspace,
} from '../types';
import { PROJECT_PALETTE, STATUS_CYCLE } from '../types';

/**
 * The complete mutation command surface (spec §5.2). Every function is pure:
 * `(workspace, args, ctx) → { workspace, changed, … }` with structural
 * sharing — untouched collections keep their identity so persistence can
 * write only what changed.
 */

export interface MutationCtx {
  today: IsoDate;
  newId: () => string;
}

export interface MutationResult {
  workspace: Workspace;
  changed: CollectionName[];
}

export interface CreatedResult extends MutationResult {
  id: string;
}

export interface DeleteFilesResult extends MutationResult {
  /** Blob files (kind === 'file') whose bytes must be removed from disk. */
  removedBlobIds: string[];
}

function unchanged(workspace: Workspace): MutationResult {
  return { workspace, changed: [] };
}

// ---------- projects ----------

export function createProject(
  ws: Workspace,
  ctx: MutationCtx,
  patch: Partial<Omit<Project, 'id'>> = {},
): CreatedResult {
  const id = ctx.newId();
  const color = PROJECT_PALETTE[ws.projects.length % PROJECT_PALETTE.length] as string;
  const project: Project = {
    id,
    name: 'Untitled project',
    category: 'work',
    tags: [],
    color,
    status: 'Active',
    notes: '',
    links: [],
    createdAt: ctx.today,
    ...patch,
  };
  return {
    workspace: { ...ws, projects: [...ws.projects, project] },
    changed: ['projects'],
    id,
  };
}

export function updateProject(
  ws: Workspace,
  id: string,
  patch: Partial<Omit<Project, 'id'>>,
): MutationResult {
  if (!ws.projects.some((p) => p.id === id)) return unchanged(ws);
  return {
    workspace: {
      ...ws,
      projects: ws.projects.map((p) => (p.id === id ? { ...p, ...patch } : p)),
    },
    changed: ['projects'],
  };
}

/** Cascades: removes the project's tasks, files, and dependency references. */
export function deleteProject(ws: Workspace, id: string): DeleteFilesResult {
  if (!ws.projects.some((p) => p.id === id)) return { ...unchanged(ws), removedBlobIds: [] };
  const removedTaskIds = new Set(ws.tasks.filter((t) => t.projectId === id).map((t) => t.id));
  const removedFiles = ws.files.filter((f) => f.projectId === id);
  return {
    workspace: {
      ...ws,
      projects: ws.projects.filter((p) => p.id !== id),
      tasks: ws.tasks
        .filter((t) => t.projectId !== id)
        .map((t) =>
          t.dependsOn.some((d) => removedTaskIds.has(d))
            ? { ...t, dependsOn: t.dependsOn.filter((d) => !removedTaskIds.has(d)) }
            : t,
        ),
      files: ws.files.filter((f) => f.projectId !== id),
    },
    changed: ['projects', 'tasks', 'files'],
    removedBlobIds: removedFiles.filter((f) => f.kind === 'file').map((f) => f.id),
  };
}

/** Reorder the sidebar/portfolio: move a project to `toIndex` (clamped). */
export function moveProject(ws: Workspace, id: string, toIndex: number): MutationResult {
  const fromIndex = ws.projects.findIndex((p) => p.id === id);
  if (fromIndex < 0) return unchanged(ws);
  const target = Math.min(ws.projects.length - 1, Math.max(0, Math.round(toIndex)));
  if (target === fromIndex) return unchanged(ws);
  const projects = [...ws.projects];
  const [moved] = projects.splice(fromIndex, 1);
  if (moved === undefined) return unchanged(ws);
  projects.splice(target, 0, moved);
  return { workspace: { ...ws, projects }, changed: ['projects'] };
}

// ---------- tasks ----------

export function createTask(
  ws: Workspace,
  ctx: MutationCtx,
  projectId: string,
  patch: Partial<Omit<Task, 'id' | 'projectId'>> = {},
): CreatedResult {
  const id = ctx.newId();
  const task: Task = {
    id,
    projectId,
    title: '',
    status: 'Todo',
    priority: 'Medium',
    tags: [],
    notes: '',
    dueDate: null,
    dependsOn: [],
    subtasks: [],
    links: [],
    createdAt: ctx.today,
    completedAt: null,
    ...patch,
  };
  if (task.status === 'Done' && task.completedAt === null) task.completedAt = ctx.today;
  if (task.status !== 'Done') task.completedAt = null;
  return {
    workspace: { ...ws, tasks: [...ws.tasks, task] },
    changed: ['tasks'],
    id,
  };
}

/**
 * Field updates with invariants:
 * - status → Done stamps completedAt (once); leaving Done clears it.
 * - moving to another project scrubs dependency links in both directions
 *   (dependsOn must stay same-project) and re-homes attached files.
 */
export function updateTask(
  ws: Workspace,
  id: string,
  patch: Partial<Omit<Task, 'id'>>,
  ctx: MutationCtx,
): MutationResult {
  const existing = ws.tasks.find((t) => t.id === id);
  if (existing === undefined) return unchanged(ws);

  const movedTo =
    patch.projectId !== undefined && patch.projectId !== existing.projectId
      ? patch.projectId
      : null;
  const moved = movedTo !== null;
  const changed: CollectionName[] = ['tasks'];

  let tasks = ws.tasks.map((t) => {
    if (t.id !== id) return t;
    const next: Task = { ...t, ...patch };
    if (patch.status !== undefined) {
      if (patch.status === 'Done') {
        if (t.completedAt === null) next.completedAt = ctx.today;
      } else {
        next.completedAt = null;
      }
    }
    if (moved) next.dependsOn = [];
    return next;
  });

  let files = ws.files;
  if (movedTo !== null) {
    // Other tasks may no longer depend on the moved task.
    tasks = tasks.map((t) =>
      t.id !== id && t.dependsOn.includes(id)
        ? { ...t, dependsOn: t.dependsOn.filter((d) => d !== id) }
        : t,
    );
    if (ws.files.some((f) => f.taskId === id)) {
      files = ws.files.map((f) => (f.taskId === id ? { ...f, projectId: movedTo } : f));
      changed.push('files');
    }
  }

  return { workspace: { ...ws, tasks, files }, changed };
}

/** Removes the task, scrubs dependsOn references, detaches its files. */
export function deleteTask(ws: Workspace, id: string): MutationResult {
  if (!ws.tasks.some((t) => t.id === id)) return unchanged(ws);
  const changed: CollectionName[] = ['tasks'];
  let files = ws.files;
  if (ws.files.some((f) => f.taskId === id)) {
    files = ws.files.map((f) => (f.taskId === id ? { ...f, taskId: null } : f));
    changed.push('files');
  }
  return {
    workspace: {
      ...ws,
      tasks: ws.tasks
        .filter((t) => t.id !== id)
        .map((t) =>
          t.dependsOn.includes(id) ? { ...t, dependsOn: t.dependsOn.filter((d) => d !== id) } : t,
        ),
      files,
    },
    changed,
  };
}

/** Todo → Doing → Waiting → Done → Todo; Dropped resets to Todo. */
export function cycleTaskStatus(ws: Workspace, id: string, ctx: MutationCtx): MutationResult {
  const t = ws.tasks.find((x) => x.id === id);
  if (t === undefined) return unchanged(ws);
  const i = STATUS_CYCLE.indexOf(t.status);
  const next = i < 0 ? 'Todo' : (STATUS_CYCLE[(i + 1) % STATUS_CYCLE.length] ?? 'Todo');
  return updateTask(ws, id, { status: next }, ctx);
}

// ---------- files ----------

export function createMarkdownFile(
  ws: Workspace,
  ctx: MutationCtx,
  projectId: string,
  taskId: string | null,
): CreatedResult {
  const id = ctx.newId();
  const file: FileEntry = {
    id,
    projectId,
    taskId,
    name: 'Untitled.md',
    ext: 'md',
    mime: 'text/markdown',
    kind: 'markdown',
    size: 0,
    content: '# Untitled\n\n',
    createdAt: ctx.today,
  };
  return {
    workspace: { ...ws, files: [...ws.files, file] },
    changed: ['files'],
    id,
  };
}

export interface UploadInfo {
  projectId: string;
  taskId: string | null;
  name: string;
  mime: string;
  size: number;
}

/** Registers metadata for an uploaded binary; bytes go to BlobService. */
export function registerUploadedFile(
  ws: Workspace,
  ctx: MutationCtx,
  upload: UploadInfo,
): CreatedResult {
  const id = ctx.newId();
  const dot = upload.name.lastIndexOf('.');
  const ext = dot > 0 ? upload.name.slice(dot + 1).toLowerCase() : '';
  const file: FileEntry = {
    id,
    projectId: upload.projectId,
    taskId: upload.taskId,
    name: upload.name,
    ext,
    mime: upload.mime,
    kind: 'file',
    size: upload.size,
    content: '',
    createdAt: ctx.today,
  };
  return {
    workspace: { ...ws, files: [...ws.files, file] },
    changed: ['files'],
    id,
  };
}

export function updateFile(
  ws: Workspace,
  id: string,
  patch: Partial<Omit<FileEntry, 'id'>>,
): MutationResult {
  if (!ws.files.some((f) => f.id === id)) return unchanged(ws);
  return {
    workspace: {
      ...ws,
      files: ws.files.map((f) => (f.id === id ? { ...f, ...patch } : f)),
    },
    changed: ['files'],
  };
}

export function deleteFile(ws: Workspace, id: string): DeleteFilesResult {
  const file = ws.files.find((f) => f.id === id);
  if (file === undefined) return { ...unchanged(ws), removedBlobIds: [] };
  return {
    workspace: { ...ws, files: ws.files.filter((f) => f.id !== id) },
    changed: ['files'],
    removedBlobIds: file.kind === 'file' ? [file.id] : [],
  };
}

// ---------- settings / whole-workspace ----------

export function updateSettings(ws: Workspace, patch: Partial<Settings>): MutationResult {
  return {
    workspace: { ...ws, settings: { ...ws.settings, ...patch } },
    changed: ['settings'],
  };
}

/** Replace everything (import, reset-to-seed). Settings are part of it. */
export function replaceWorkspace(next: Workspace): MutationResult {
  return { workspace: next, changed: ['projects', 'tasks', 'files', 'settings'] };
}

/** Clear all projects/tasks/files (cascade); settings survive. */
export function clearAll(ws: Workspace): DeleteFilesResult {
  return {
    workspace: { ...ws, projects: [], tasks: [], files: [] },
    changed: ['projects', 'tasks', 'files'],
    removedBlobIds: ws.files.filter((f) => f.kind === 'file').map((f) => f.id),
  };
}
