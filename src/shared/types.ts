/**
 * Core domain types and constants. See docs/TECHNICAL_SPEC.md §3.
 * This module (like all of src/shared) is pure TypeScript with zero
 * Electron/DOM/fs dependencies.
 */

/** Calendar date in ISO `YYYY-MM-DD` form, always local-timezone semantics. */
export type IsoDate = string;

export type ProjectCategory = 'work' | 'home';

export const TASK_STATUSES = ['Todo', 'Doing', 'Waiting', 'Done', 'Dropped'] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

/** Click-the-circle cycle. Dropped is reachable only via the status select. */
export const STATUS_CYCLE: readonly TaskStatus[] = ['Todo', 'Doing', 'Waiting', 'Done'];

export const TASK_PRIORITIES = ['Critical', 'High', 'Medium', 'Low'] as const;
export type TaskPriority = (typeof TASK_PRIORITIES)[number];

/** Round-robin project dot/progress colors (design/README.md §Design Tokens). */
export const PROJECT_PALETTE = [
  '#4f5bd5',
  '#2f8552',
  '#a8710f',
  '#c23b2b',
  '#7c4dd6',
  '#0e8a8a',
  '#c2569b',
] as const;

export type FileKind = 'markdown' | 'file' | 'ref';

export interface LinkRef {
  title: string;
  url: string;
}

export interface Subtask {
  title: string;
  done: boolean;
}

export interface Project {
  id: string;
  name: string;
  /** Drives Work/Home scoping everywhere. */
  category: ProjectCategory;
  tags: string[];
  /** Hex color, assigned round-robin from PROJECT_PALETTE. */
  color: string;
  /** Free-form; default "Active". */
  status: string;
  notes: string;
  links: LinkRef[];
  /**
   * Archived projects are parked: hidden from the sidebar, Command Center,
   * calendar, reports, and pickers, but kept (with all their tasks/files)
   * and reachable from the sidebar's Archived section and search.
   * Optional so pre-1.6 workspaces and fixtures need no migration.
   */
  archived?: boolean;
  /**
   * Hand-placed dependency-map node positions in SVG units, keyed by task id
   * (D20). Task ids not listed keep their computed layer slot, so the map
   * degrades to the automatic layout when this is absent or stale.
   */
  depLayout?: Record<string, { x: number; y: number }>;
  /** Dependency-map canvas height in px; absent = fit the layout. */
  depMapHeight?: number;
  /**
   * Hide Done tasks on this project's screen (D30). Per-project and persisted,
   * because it is a property of the project — a long-running backlog wants its
   * finished work out of the way, a short project does not. Optional-additive
   * like `archived`, so older workspaces round-trip unchanged.
   */
  hideCompleted?: boolean;
  /**
   * People attached to the project itself (D31). The project's Contacts card
   * shows these *plus* everyone linked to one of its tasks, so this list only
   * holds the ones added directly — a stakeholder with no task of their own.
   */
  contactIds?: string[];
  createdAt: IsoDate;
}

/** Bounds for the resizable dependency-map card. */
export const DEP_MAP_MIN_H = 160;
export const DEP_MAP_MAX_H = 2000;

/**
 * One recorded due-date push-out (D23). Appended by `updateTask` whenever an
 * open task's existing due date moves later; pulling a date in, or setting a
 * due date for the first time, is not a deferral.
 */
export interface Deferral {
  /** Due date before the change. */
  from: IsoDate;
  /** Due date after the change. */
  to: IsoDate;
  /** The day the push-out was recorded. */
  on: IsoDate;
}

export interface Task {
  id: string;
  projectId: string;
  title: string;
  status: TaskStatus;
  priority: TaskPriority;
  tags: string[];
  notes: string;
  dueDate: IsoDate | null;
  /** Task ids this task is blocked by; always same-project siblings. */
  dependsOn: string[];
  subtasks: Subtask[];
  links: LinkRef[];
  createdAt: IsoDate;
  /** Non-null iff status === 'Done' (enforced by the mutation layer). */
  completedAt: IsoDate | null;
  /**
   * Due-date push-outs, oldest first (D23). Optional so pre-1.16 workspaces
   * and fixtures round-trip unchanged; absent means "never deferred".
   */
  deferrals?: Deferral[];
  /**
   * People associated with this task (D31), by contact id. Optional-additive
   * like `deferrals`, so pre-2.0 workspaces round-trip byte-identical;
   * absent means "nobody linked".
   */
  contactIds?: string[];
}

/**
 * A person you work with (D31). Deliberately a small, flat record: the app is
 * not trying to be an address book, it is trying to answer "who asked me for
 * this and how do I reach them". Every field beyond the name is optional at
 * the semantic level (empty string = not recorded), so a contact captured in
 * three seconds from an @-mention is a valid contact.
 *
 * Built to grow: new fields are added the same way `archived` was added to
 * Project — optional-additive with a `.catch()` default in the schema, never
 * a migration step.
 */
export interface Contact {
  id: string;
  firstName: string;
  lastName: string;
  /** Employer or org; free-form, and the grouping key on the contacts screen. */
  company: string;
  /** Team or division within the company; free-form, often blank. */
  department: string;
  /** Job title or how they relate to you ("VP Eng", "Acme account rep"). */
  role: string;
  email: string;
  phone: string;
  notes: string;
  /** Free-form, shared with the project/task tag vocabulary. */
  tags: string[];
  /**
   * Who this person reports to, by contact id (D32). Optional-additive, and
   * one-directional: "manages" is derived by looking for everyone whose
   * managerId points here, so an org chart can never disagree with itself.
   */
  managerId?: string;
  /**
   * Hand-placed org-map node positions in SVG units, keyed by contact id
   * (D34) — the same shape and the same optional-additive rules as a
   * project's `depLayout` (D20). Ids not listed keep their computed row.
   */
  orgLayout?: Record<string, { x: number; y: number }>;
  /** Org-map canvas height in px; absent = fit the layout. */
  orgMapHeight?: number;
  createdAt: IsoDate;
}

/** Bounds for the resizable org map; the dependency map's, one row shorter. */
export const ORG_MAP_MIN_H = 140;
export const ORG_MAP_MAX_H = 2000;

export interface FileEntry {
  id: string;
  projectId: string;
  /** When set, also appears as an attachment on that task. */
  taskId: string | null;
  /** Display name including extension, e.g. "Rollback plan.md". */
  name: string;
  /** Lowercase, no dot: "md", "pdf", "csv", … */
  ext: string;
  mime: string;
  /**
   * markdown = editable text stored in `content`;
   * file     = binary blob on disk (blobs/<id>.<ext>);
   * ref      = pointer/placeholder with a note, no stored bytes.
   */
  kind: FileKind;
  /** Bytes; 0 for markdown/ref. */
  size: number;
  /** Ref entries only. */
  note?: string;
  /** Markdown source (kind === 'markdown' only). */
  content: string;
  createdAt: IsoDate;
}

export const BACKUP_KEEP_DEFAULT = 10;
export const BACKUP_KEEP_MAX = 100;

/**
 * Dock/taskbar badge (D28): off, tasks due today, or tasks already overdue.
 * Defaults to 'none' so upgrading an existing workspace changes nothing.
 */
export const BADGE_CHOICES = ['none', 'due', 'overdue'] as const;
export type BadgeMode = (typeof BADGE_CHOICES)[number];

export const TODOIST_SYNC_CHOICES = ['manual', 'hourly', 'daily'] as const;
export type TodoistSyncEvery = (typeof TODOIST_SYNC_CHOICES)[number];

export interface Settings {
  todoistToken: string;
  /** How often the completion sync runs on its own (D17). */
  todoistSyncEvery: TodoistSyncEvery;
  /** ISO datetime of the last completion-sync attempt; informational. */
  lastTodoistSyncAt: string | null;
  /** Backup folder; null = <dataDir>/backups. */
  backupDir: string | null;
  /** Daily backup folders to keep (1–100). */
  backupKeep: number;
  /** Push-to-Todoist window: tasks due within the next N days (1–60). */
  todoistPushDays: number;
  /** Anthropic API key for the AI task import (spec D12); plaintext like D10. */
  anthropicApiKey: string;
  /** Debug logging (D18): record app activity to a plain-text log file. */
  debugLogging: boolean;
  /** Debug log folder; null = <userData>/logs (next to main.log). */
  debugLogDir: string | null;
  /** What the dock/taskbar badge counts, if anything (D28). */
  badgeMode: BadgeMode;
}

export const DEFAULT_SETTINGS: Settings = {
  todoistToken: '',
  todoistSyncEvery: 'manual',
  lastTodoistSyncAt: null,
  backupDir: null,
  backupKeep: BACKUP_KEEP_DEFAULT,
  todoistPushDays: 7,
  anthropicApiKey: '',
  debugLogging: false,
  debugLogDir: null,
  badgeMode: 'none',
};

/** The full in-memory domain state. */
export interface Workspace {
  projects: Project[];
  tasks: Task[];
  files: FileEntry[];
  contacts: Contact[];
  settings: Settings;
}

export const COLLECTION_NAMES = ['projects', 'tasks', 'files', 'contacts', 'settings'] as const;
export type CollectionName = (typeof COLLECTION_NAMES)[number];

export const SCHEMA_VERSION = 1;

/** App-level configuration; lives in Electron userData, not the workspace. */
export interface AppConfig {
  /** Absolute path of the workspace directory. */
  dataDir: string;
  windowBounds?: { x: number; y: number; width: number; height: number };
}

export function emptyWorkspace(): Workspace {
  return { projects: [], tasks: [], files: [], contacts: [], settings: { ...DEFAULT_SETTINGS } };
}
