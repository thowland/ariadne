import { z } from 'zod';

import { isValidIsoDate } from '../domain/dates';
import type { FileEntry, Project, Settings, Task, Workspace } from '../types';
import { TASK_PRIORITIES, TASK_STATUSES } from '../types';

/**
 * Validation for everything read from disk or imported. Lenient where safe
 * (missing collections/fields default; unknown keys are stripped) and strict
 * where corruption would poison the app (ids, enums, date shapes).
 */

const isoDate = z.string().refine(isValidIsoDate, { message: 'invalid ISO date (YYYY-MM-DD)' });
const isoDateOrNull = isoDate.nullable().catch(null);

const linkRefSchema = z
  .object({
    title: z.string().catch(''),
    url: z.string().catch(''),
  })
  .transform(({ title, url }) => ({ title, url }));

const subtaskSchema = z.object({
  title: z.string().catch(''),
  done: z.boolean().catch(false),
});

export const projectSchema = z.object({
  id: z.string().min(1),
  name: z.string().catch('Untitled project'),
  category: z.enum(['work', 'home']).catch('work'),
  tags: z.array(z.string()).catch([]),
  color: z.string().catch('#4f5bd5'),
  status: z.string().catch('Active'),
  notes: z.string().catch(''),
  links: z.array(linkRefSchema).catch([]),
  // Optional so pre-1.6 documents round-trip byte-identical.
  archived: z.boolean().optional().catch(false),
  createdAt: isoDate,
});

export const taskSchema = z.object({
  id: z.string().min(1),
  projectId: z.string().min(1),
  title: z.string().catch(''),
  status: z.enum(TASK_STATUSES).catch('Todo'),
  priority: z.enum(TASK_PRIORITIES).catch('Medium'),
  tags: z.array(z.string()).catch([]),
  notes: z.string().catch(''),
  dueDate: isoDateOrNull.default(null),
  dependsOn: z.array(z.string()).catch([]),
  subtasks: z.array(subtaskSchema).catch([]),
  links: z.array(linkRefSchema).catch([]),
  createdAt: isoDate,
  completedAt: isoDateOrNull.default(null),
});

export const fileEntrySchema = z.object({
  id: z.string().min(1),
  projectId: z.string().min(1),
  taskId: z.string().nullable().catch(null),
  name: z.string().catch('Untitled'),
  ext: z.string().catch(''),
  mime: z.string().catch(''),
  kind: z.enum(['markdown', 'file', 'ref']).catch('ref'),
  size: z.number().int().nonnegative().catch(0),
  note: z.string().optional(),
  content: z.string().catch(''),
  createdAt: isoDate,
});

export const settingsSchema = z.object({
  todoistToken: z.string().catch(''),
  lastTodoistImportAt: z.string().nullable().catch(null),
  backupDir: z.string().min(1).nullable().catch(null),
  backupKeep: z
    .preprocess(
      (v) => (typeof v === 'number' ? Math.min(100, Math.max(1, Math.round(v))) : v),
      z.number().int().min(1).max(100),
    )
    .catch(10),
  todoistPushDays: z
    .preprocess(
      (v) => (typeof v === 'number' ? Math.min(60, Math.max(1, Math.round(v))) : v),
      z.number().int().min(1).max(60),
    )
    .catch(7),
  anthropicApiKey: z.string().catch(''),
});

export const projectsFileSchema = z.array(projectSchema);
export const tasksFileSchema = z.array(taskSchema);
export const filesFileSchema = z.array(fileEntrySchema);

export const workspaceMetaSchema = z.object({
  schemaVersion: z.number().int().positive(),
});

/**
 * Referential-integrity cleanup applied after individual documents parse:
 * drops tasks/files whose project vanished, scrubs dangling/cross-project
 * dependsOn entries and dangling file→task links, and re-establishes the
 * completedAt iff Done invariant.
 */
export function normalizeWorkspace(
  projects: Project[],
  tasks: Task[],
  files: FileEntry[],
  settings: Settings,
): { workspace: Workspace; warnings: string[] } {
  const warnings: string[] = [];
  const projectIds = new Set(projects.map((p) => p.id));

  const keptTasks = tasks.filter((t) => projectIds.has(t.projectId));
  if (keptTasks.length !== tasks.length) {
    warnings.push(`Dropped ${tasks.length - keptTasks.length} task(s) with no parent project`);
  }

  const byProject = new Map<string, string>(keptTasks.map((t) => [t.id, t.projectId]));
  for (const t of keptTasks) {
    const before = t.dependsOn.length;
    t.dependsOn = t.dependsOn.filter((id) => byProject.get(id) === t.projectId && id !== t.id);
    if (t.dependsOn.length !== before) {
      warnings.push(`Task "${t.title || t.id}": removed invalid dependency reference(s)`);
    }
    if (t.status === 'Done' && t.completedAt === null) t.completedAt = t.createdAt;
    if (t.status !== 'Done' && t.completedAt !== null) t.completedAt = null;
  }

  const keptFiles = files.filter((f) => projectIds.has(f.projectId));
  if (keptFiles.length !== files.length) {
    warnings.push(`Dropped ${files.length - keptFiles.length} file(s) with no parent project`);
  }
  const taskIds = new Set(keptTasks.map((t) => t.id));
  for (const f of keptFiles) {
    if (f.taskId !== null && !taskIds.has(f.taskId)) f.taskId = null;
  }

  return {
    workspace: { projects, tasks: keptTasks, files: keptFiles, settings },
    warnings,
  };
}
