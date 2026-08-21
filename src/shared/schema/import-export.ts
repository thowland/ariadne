import type { FileEntry, Workspace } from '../types';
import { DEFAULT_SETTINGS, SCHEMA_VERSION } from '../types';

import {
  contactsFileSchema,
  filesFileSchema,
  normalizeWorkspace,
  projectsFileSchema,
  settingsSchema,
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
