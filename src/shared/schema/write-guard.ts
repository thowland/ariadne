import type { CollectionName } from '../types';
import { COLLECTION_NAMES } from '../types';

import {
  filesFileSchema,
  projectsFileSchema,
  settingsSchema,
  tasksFileSchema,
} from './workspace-schema';

/**
 * Gatekeeper for renderer → disk collection writes. Loads are zod-validated
 * with quarantine/backup recovery, but historically writes were persisted
 * unchecked — a buggy renderer payload (e.g. `projects: []`) would overwrite a
 * good document and cascade into orphan-dropping on the next load. Every
 * write must now pass this screen:
 *
 * 1. The payload must satisfy the collection's schema (shape gate — the data
 *    itself is written verbatim, not the parsed/defaulted form, so disk always
 *    mirrors renderer memory).
 * 2. Shrink tripwire: an empty list may not replace a document that held two
 *    or more entries, except when
 *    - the payload carries `replaceAll` (set only by clearAll /
 *      replaceWorkspace — the deliberate wipe-and-replace flows), or
 *    - it is a tasks/files write arriving alongside a projects write (a
 *      project-delete cascade legitimately empties dependents), or
 *    - the previous document held ≤ 1 entry (deleting the last project).
 */

const WRITE_SCHEMAS = {
  projects: projectsFileSchema,
  tasks: tasksFileSchema,
  files: filesFileSchema,
  settings: settingsSchema,
} as const;

export interface RejectedWrite {
  name: CollectionName;
  reason: string;
}

export interface ScreenedSave {
  /** Collections that passed, in COLLECTION_NAMES order, with their payloads. */
  accepted: [CollectionName, unknown][];
  rejected: RejectedWrite[];
}

export function screenWorkspaceSave(
  payload: Record<string, unknown>,
  /** Entry count of the current document; null = missing/unknown (never blocks). */
  prevCount: (name: CollectionName) => number | null,
): ScreenedSave {
  const replaceAll = payload.replaceAll === true;
  const accepted: [CollectionName, unknown][] = [];
  const rejected: RejectedWrite[] = [];

  for (const name of COLLECTION_NAMES) {
    const data = payload[name];
    if (data === undefined) continue;

    if (!WRITE_SCHEMAS[name].safeParse(data).success) {
      rejected.push({ name, reason: `${name} payload failed validation` });
      continue;
    }

    if (name !== 'settings' && Array.isArray(data) && data.length === 0 && !replaceAll) {
      const prev = prevCount(name);
      const cascade = name !== 'projects' && payload.projects !== undefined;
      if (prev !== null && prev >= 2 && !cascade) {
        rejected.push({
          name,
          reason: `refusing to overwrite ${String(prev)} ${name} with an empty list`,
        });
        continue;
      }
    }

    accepted.push([name, data]);
  }

  return { accepted, rejected };
}
