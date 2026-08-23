import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  contactsFileSchema,
  filesFileSchema,
  normalizeWorkspace,
  projectsFileSchema,
  tasksFileSchema,
} from '@shared/schema/workspace-schema';
import type { Workspace } from '@shared/types';
import { DEFAULT_SETTINGS } from '@shared/types';
import type { ZodType, ZodTypeDef } from 'zod';

/**
 * Loading the workspace read-only (D39).
 *
 * Deliberately not `StorageService`: that class owns *writing* — debounced
 * flushes, a retry timer, quarantine-and-restore — and none of that belongs
 * in a process whose entire contract is that it cannot change anything. What
 * is shared is the part that matters, the zod schemas and
 * `normalizeWorkspace`, so the server sees exactly the workspace the app
 * would see.
 *
 * Settings are **never** read. `settings.json` holds the Todoist token and
 * the Anthropic key in plaintext (D10), and an assistant with a shell has no
 * business being handed either; the loader substitutes defaults so the shape
 * is still a valid Workspace.
 */

// The same signature StorageService uses: the third parameter matters —
// `ZodType<T>` alone makes the input type default to T and inference collapses.
function loadDocument<T>(
  dir: string,
  file: string,
  schema: ZodType<T, ZodTypeDef, unknown>,
  fallback: T,
): T {
  const path = join(dir, file);
  if (!existsSync(path)) return fallback;
  try {
    const parsed = schema.safeParse(JSON.parse(readFileSync(path, 'utf8')));
    return parsed.success ? parsed.data : fallback;
  } catch {
    return fallback;
  }
}

/**
 * Reads the workspace from disk. Called fresh for every tool call rather than
 * cached: the app flushes ~300ms after an edit, and a stale answer to "what
 * is due today" is worse than reading a few hundred kilobytes again.
 */
export function readWorkspace(dataDir: string): Workspace {
  const projects = loadDocument(dataDir, 'projects.json', projectsFileSchema, []);
  const tasks = loadDocument(dataDir, 'tasks.json', tasksFileSchema, []);
  const files = loadDocument(dataDir, 'files.json', filesFileSchema, []);
  const contacts = loadDocument(dataDir, 'contacts.json', contactsFileSchema, []);
  // Defaults, not the real settings: see the note above.
  return normalizeWorkspace(projects, tasks, files, contacts, { ...DEFAULT_SETTINGS }).workspace;
}
