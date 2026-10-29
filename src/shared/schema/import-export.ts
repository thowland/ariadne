import { isValidIsoDate } from '../domain/dates';
import { looksLikeXml, readMspdi } from '../domain/mspdi';
import { convertMsProject, isMsProjectDocument } from '../domain/msproject';
import type { FileEntry, IsoDate, Project, Task, Workspace } from '../types';
import { DEFAULT_SETTINGS, SCHEMA_VERSION } from '../types';

import {
  contactsFileSchema,
  fileEntrySchema,
  filesFileSchema,
  normalizeWorkspace,
  projectSchema,
  projectsFileSchema,
  settingsSchema,
  taskSchema,
  tasksFileSchema,
} from './workspace-schema';

/**
 * Whole-workspace import/export (spec §5.3 ImportExportService, pure part).
 * The export document is prototype-compatible: `_blobs` maps fileId → data
 * URL, and legacy `project.docs[]` entries are migrated to `kind:"ref"`
 * FileEntries on import.
 */

export interface ExportDocument {
  schemaVersion: number;
  projects: Workspace['projects'];
  tasks: Workspace['tasks'];
  files: Workspace['files'];
  contacts: Workspace['contacts'];
  settings: Workspace['settings'];
  _blobs: Record<string, string>;
}

export function buildExport(workspace: Workspace, blobs: Record<string, string>): ExportDocument {
  return {
    schemaVersion: SCHEMA_VERSION,
    projects: workspace.projects,
    tasks: workspace.tasks,
    files: workspace.files,
    contacts: workspace.contacts,
    settings: workspace.settings,
    _blobs: blobs,
  };
}

export interface ParsedImport {
  workspace: Workspace;
  /** fileId → data URL, to be materialized into the blobs directory. */
  blobs: Record<string, string>;
  warnings: string[];
}

export type ImportResult = { ok: true; value: ParsedImport } | { ok: false; error: string };

interface LegacyDoc {
  name?: unknown;
  note?: unknown;
}

/** Accepts native exports and prototype localStorage exports. */
export function parseImport(rawText: string, newId: () => string): ImportResult {
  let raw: unknown;
  try {
    raw = JSON.parse(rawText);
  } catch {
    return { ok: false, error: 'Invalid JSON — import failed' };
  }
  if (typeof raw !== 'object' || raw === null) {
    return { ok: false, error: 'Invalid JSON — import failed' };
  }
  const doc = raw as Record<string, unknown>;
  if (!Array.isArray(doc.projects) || !Array.isArray(doc.tasks)) {
    return { ok: false, error: 'Not an Ariadne export (missing projects/tasks)' };
  }

  const warnings: string[] = [];

  // Migrate legacy project.docs[] → ref FileEntries (prototype's own migration).
  const extraFiles: FileEntry[] = [];
  for (const p of doc.projects) {
    if (typeof p !== 'object' || p === null) continue;
    const proj = p as Record<string, unknown>;
    if (Array.isArray(proj.docs) && proj.docs.length > 0 && typeof proj.id === 'string') {
      for (const d of proj.docs as LegacyDoc[]) {
        extraFiles.push({
          id: newId(),
          projectId: proj.id,
          taskId: null,
          name: typeof d.name === 'string' ? d.name : 'Document',
          ext: '',
          mime: '',
          kind: 'ref',
          size: 0,
          note: typeof d.note === 'string' ? d.note : '',
          content: '',
          createdAt: typeof proj.createdAt === 'string' ? proj.createdAt : '1970-01-01',
        });
      }
      warnings.push(`Migrated ${proj.docs.length} legacy document reference(s)`);
    }
  }

  const projects = projectsFileSchema.safeParse(doc.projects);
  const tasks = tasksFileSchema.safeParse(doc.tasks);
  const rawFiles: unknown[] = Array.isArray(doc.files) ? (doc.files as unknown[]) : [];
  const files = filesFileSchema.safeParse([...rawFiles, ...extraFiles]);
  // Absent in every export written before 2.0; an unreadable list costs the
  // contacts, not the import.
  const rawContacts: unknown[] = Array.isArray(doc.contacts) ? (doc.contacts as unknown[]) : [];
  const contacts = contactsFileSchema.safeParse(rawContacts);
  if (!contacts.success && rawContacts.length > 0) {
    warnings.push('Contacts in this export failed validation and were skipped');
  }
  const settings = settingsSchema.safeParse(doc.settings ?? { ...DEFAULT_SETTINGS });
  if (!projects.success || !tasks.success || !files.success) {
    return { ok: false, error: 'Export contents failed validation' };
  }

  const normalized = normalizeWorkspace(
    projects.data,
    tasks.data,
    files.data,
    contacts.success ? contacts.data : [],
    settings.success ? settings.data : { ...DEFAULT_SETTINGS },
  );

  const blobs: Record<string, string> = {};
  if (typeof doc._blobs === 'object' && doc._blobs !== null) {
    for (const [id, dataUrl] of Object.entries(doc._blobs)) {
      if (typeof dataUrl === 'string' && dataUrl.startsWith('data:')) blobs[id] = dataUrl;
    }
  }

  return {
    ok: true,
    value: {
      workspace: normalized.workspace,
      blobs,
      warnings: [...warnings, ...normalized.warnings],
    },
  };
}

// ---------- single-project import (D52) ----------

/**
 * One project read from a JSON file, ready to be added alongside the
 * projects already in the workspace. Ids here are the ones the file used;
 * `importProject` (mutate.ts) replaces every one of them, so nothing in the
 * file can overwrite or collide with what is already there.
 */
export interface ProjectImport {
  /**
   * `id` is a placeholder; `color` is null when the file had no usable
   * `#rrggbb` colour.
   */
  project: Omit<Project, 'color'> & { color: string | null };
  /** `projectId` is meaningless until import; `dependsOn` uses the file's ids. */
  tasks: Task[];
  /** Markdown notes and references only — a JSON file carries no blob bytes. */
  files: FileEntry[];
  warnings: string[];
}

export type ProjectImportResult = { ok: true; value: ProjectImport } | { ok: false; error: string };

const PLACEHOLDER_PROJECT_ID = '__import__';
const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

function asRecord(v: unknown): Record<string, unknown> | null {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;
}

function asArray(v: unknown): unknown[] {
  return Array.isArray(v) ? (v as unknown[]) : [];
}

function plural(n: number, word: string): string {
  return `${String(n)} ${word}${n === 1 ? '' : 's'}`;
}

/**
 * Finds the one project in a document and the tasks and files that belong to
 * it. Three shapes are accepted, so a file can come from anywhere:
 * `{ project, tasks, files }`; a bare project object that carries its own
 * `tasks` (and optionally `files`); and a whole-workspace export that holds
 * exactly one project.
 */
function locateProject(
  doc: Record<string, unknown>,
):
  | { ok: true; project: Record<string, unknown>; tasks: unknown[]; files: unknown[] }
  | { ok: false; error: string } {
  const wrapped = asRecord(doc.project);
  if (wrapped !== null) {
    return {
      ok: true,
      project: wrapped,
      tasks: [...asArray(doc.tasks), ...asArray(wrapped.tasks)],
      files: [...asArray(doc.files), ...asArray(wrapped.files)],
    };
  }
  if (Array.isArray(doc.projects)) {
    if (doc.projects.length !== 1) {
      return {
        ok: false,
        error:
          doc.projects.length === 0
            ? 'This file holds no project to import'
            : `This file holds ${String(doc.projects.length)} projects — use Import file… in Settings to restore a whole workspace`,
      };
    }
    const only = asRecord(doc.projects[0]);
    if (only === null) return { ok: false, error: 'Not an Ariadne project (no project found)' };
    // A workspace export keeps every task in one list; take only this project's.
    const mine = (x: unknown): boolean => {
      const pid = asRecord(x)?.projectId;
      return pid === undefined || pid === only.id;
    };
    return {
      ok: true,
      project: only,
      tasks: asArray(doc.tasks).filter(mine),
      files: asArray(doc.files).filter(mine),
    };
  }
  if (typeof doc.name === 'string') {
    return { ok: true, project: doc, tasks: asArray(doc.tasks), files: asArray(doc.files) };
  }
  return { ok: false, error: 'Not an Ariadne project (no project found)' };
}

/**
 * Parses one project from JSON text. Lenient in the same places the workspace
 * schema is — a missing field takes its default, and a task or note that
 * cannot be read is skipped with a warning rather than failing the import —
 * but refuses a file it cannot find a project in at all. Missing ids and
 * dates are filled in, because a hand-written or generated file rarely has
 * them; `today` stands in for an absent or malformed `createdAt`.
 */
export function parseProjectImport(rawText: string, today: IsoDate): ProjectImportResult {
  const warnings: string[] = [];
  let doc: Record<string, unknown>;
  if (looksLikeXml(rawText)) {
    // MS Project's own XML export (D54), read into the same loose task
    // document a JSON conversion gives and translated the same way.
    const xml = readMspdi(rawText);
    if (!xml.ok) return xml;
    const converted = convertMsProject(xml.doc, today);
    doc = converted.doc;
    warnings.push(...converted.warnings);
  } else {
    let raw: unknown;
    try {
      raw = JSON.parse(rawText);
    } catch {
      return { ok: false, error: 'Invalid JSON — import failed' };
    }
    const parsedDoc = asRecord(raw);
    if (parsedDoc === null)
      return { ok: false, error: 'Not an Ariadne project (no project found)' };
    doc = parsedDoc;
    // A plan converted from an MS Project .mpp file (D53) is translated into
    // the { project, tasks } shape first, then checked like any other import.
    if (isMsProjectDocument(parsedDoc)) {
      const converted = convertMsProject(parsedDoc, today);
      doc = converted.doc;
      warnings.push(...converted.warnings);
    }
  }
  const located = locateProject(doc);
  if (!located.ok) return located;

  const dated = (r: Record<string, unknown>): IsoDate =>
    typeof r.createdAt === 'string' && isValidIsoDate(r.createdAt) ? r.createdAt : today;

  const rawProject = located.project;
  const parsedProject = projectSchema.safeParse({
    ...rawProject,
    id: PLACEHOLDER_PROJECT_ID,
    createdAt: dated(rawProject),
  });
  // Every field has a default except the two filled in above, so this only
  // fails on input zod cannot coerce at all.
  if (!parsedProject.success) return { ok: false, error: 'Project failed validation' };
  const color =
    typeof rawProject.color === 'string' && HEX_COLOR.test(rawProject.color)
      ? rawProject.color
      : null;

  const tasks: Task[] = [];
  const seenIds = new Set<string>();
  let badTasks = 0;
  located.tasks.forEach((t, i) => {
    const r = asRecord(t);
    if (r === null) {
      badTasks += 1;
      return;
    }
    // A task with no id (or a repeated one) gets one nothing can point at,
    // so a dependency can only ever resolve to the task the file meant.
    const given = typeof r.id === 'string' && r.id !== '' && !seenIds.has(r.id) ? r.id : null;
    const id = given ?? `__import_task_${String(i)}__`;
    const parsed = taskSchema.safeParse({
      ...r,
      id,
      projectId: PLACEHOLDER_PROJECT_ID,
      createdAt: dated(r),
    });
    if (!parsed.success) {
      badTasks += 1;
      return;
    }
    seenIds.add(id);
    tasks.push(parsed.data);
  });
  if (badTasks > 0) warnings.push(`${plural(badTasks, 'unreadable task')} skipped`);

  const files: FileEntry[] = [];
  let blobFiles = 0;
  let badFiles = 0;
  located.files.forEach((f, i) => {
    const r = asRecord(f);
    if (r === null) {
      badFiles += 1;
      return;
    }
    const parsed = fileEntrySchema.safeParse({
      ...r,
      id: typeof r.id === 'string' && r.id !== '' ? r.id : `__import_file_${String(i)}__`,
      projectId: PLACEHOLDER_PROJECT_ID,
      createdAt: dated(r),
    });
    if (!parsed.success) {
      badFiles += 1;
      return;
    }

    if (parsed.data.kind === 'file') {
      blobFiles += 1;
      return;
    }
    files.push(parsed.data);
  });
  if (blobFiles > 0) {
    warnings.push(`${plural(blobFiles, 'uploaded file')} left out (JSON carries no file contents)`);
  }
  if (badFiles > 0) warnings.push(`${plural(badFiles, 'unreadable note')} skipped`);

  return {
    ok: true,
    value: { project: { ...parsedProject.data, color }, tasks, files, warnings },
  };
}
