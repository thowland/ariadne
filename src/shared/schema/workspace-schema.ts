import { z } from 'zod';

import { isValidIsoDate } from '../domain/dates';
import type { Contact, FileEntry, Project, Settings, Task, Workspace } from '../types';
import { BADGE_CHOICES, TASK_PRIORITIES, TASK_STATUSES, THEME_CHOICES } from '../types';

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
  depLayout: z
    .record(z.string(), z.object({ x: z.number().finite(), y: z.number().finite() }))
    .optional()
    .catch(undefined),
  depMapHeight: z.number().finite().optional().catch(undefined),
  hideCompleted: z.boolean().optional().catch(false),
  contactIds: z.array(z.string()).optional().catch(undefined),
  createdAt: isoDate,
});

const deferralSchema = z.object({
  from: isoDate,
  to: isoDate,
  on: isoDate,
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
  // Optional so pre-1.14 documents round-trip byte-identical. A single
  // malformed entry is dropped rather than costing the whole history.
  deferrals: z
    .preprocess(
      (v) => (Array.isArray(v) ? v.filter((d) => deferralSchema.safeParse(d).success) : v),
      z.array(deferralSchema),
    )
    .optional()
    .catch(undefined),
  contactIds: z.array(z.string()).optional().catch(undefined),
  estimateHours: z.number().finite().nonnegative().optional().catch(undefined),
});

/**
 * Contacts (D31). Everything but the id has a `.catch()` default: a contact
 * missing a phone number is a contact, and refusing to load one because a
 * field is the wrong shape would lose the person entirely.
 */
export const contactSchema = z.object({
  id: z.string().min(1),
  firstName: z.string().catch(''),
  lastName: z.string().catch(''),
  company: z.string().catch(''),
  // Added in 2.1; `.catch` covers the key being absent entirely, so a 2.0
  // contacts.json loads without a migration.
  department: z.string().catch(''),
  role: z.string().catch(''),
  email: z.string().catch(''),
  phone: z.string().catch(''),
  notes: z.string().catch(''),
  tags: z.array(z.string()).catch([]),
  managerId: z.string().optional().catch(undefined),
  orgLayout: z
    .record(z.string(), z.object({ x: z.number().finite(), y: z.number().finite() }))
    .optional()
    .catch(undefined),
  orgMapHeight: z.number().finite().optional().catch(undefined),
  createdAt: isoDate,
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
  todoistSyncEvery: z.enum(['manual', 'hourly', 'daily']).catch('manual'),
  lastTodoistSyncAt: z.string().nullable().catch(null),
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
  debugLogging: z.boolean().catch(false),
  debugLogDir: z.string().min(1).nullable().catch(null),
  badgeMode: z.enum(BADGE_CHOICES).catch('none'),
  theme: z.enum(THEME_CHOICES).catch('system'),
});

export const projectsFileSchema = z.array(projectSchema);
export const tasksFileSchema = z.array(taskSchema);
export const filesFileSchema = z.array(fileEntrySchema);
export const contactsFileSchema = z.array(contactSchema);

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
  contacts: Contact[],
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

  // Contact links point at a separate collection, so a contact deleted by an
  // older build (or a hand-edited contacts.json) can leave ids behind. Scrub
  // them rather than rendering a person who no longer exists.
  const contactIds = new Set(contacts.map((c) => c.id));
  const scrubContacts = (entity: { contactIds?: string[] }): boolean => {
    if (entity.contactIds === undefined) return false;
    const kept = entity.contactIds.filter((id) => contactIds.has(id));
    if (kept.length === entity.contactIds.length) return false;
    entity.contactIds = kept;
    return true;
  };
  let scrubbed = 0;
  for (const p of projects) if (scrubContacts(p)) scrubbed += 1;
  for (const t of keptTasks) if (scrubContacts(t)) scrubbed += 1;
  if (scrubbed > 0) {
    warnings.push(`Removed contact reference(s) from ${String(scrubbed)} item(s)`);
  }

  // A manager who was deleted, or somebody made their own manager by a hand
  // edit, would otherwise render as a broken link or a one-node loop (D32).
  let orphanedManagers = 0;
  for (const c of contacts) {
    if (c.managerId === undefined) continue;
    if (c.managerId === c.id || !contactIds.has(c.managerId)) {
      delete c.managerId;
      orphanedManagers += 1;
    }
  }
  if (orphanedManagers > 0) {
    warnings.push(`Cleared ${String(orphanedManagers)} unusable manager link(s)`);
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
    workspace: { projects, tasks: keptTasks, files: keptFiles, contacts, settings },
    warnings,
  };
}
