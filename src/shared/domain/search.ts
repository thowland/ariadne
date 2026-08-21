import type { Project, Task } from '../types';

/**
 * Top-bar search. Case-insensitive substring match; projects on name/tags,
 * tasks on title/notes/tags (prototype viewSearch), contacts on everything
 * recorded about them.
 *
 * `searchContacts` lives in `contacts.ts` next to the rest of the contact
 * vocabulary and is re-exported here so every caller has one import for
 * "search the workspace".
 */
export { searchContacts } from './contacts';

export function searchProjects(projects: readonly Project[], query: string): Project[] {
  const q = query.trim().toLowerCase();
  if (q === '') return [];
  return projects.filter(
    (p) => p.name.toLowerCase().includes(q) || p.tags.some((t) => t.toLowerCase().includes(q)),
  );
}

export function searchTasks(tasks: readonly Task[], query: string): Task[] {
  const q = query.trim().toLowerCase();
  if (q === '') return [];
  return tasks.filter(
    (t) =>
      t.title.toLowerCase().includes(q) ||
      t.notes.toLowerCase().includes(q) ||
      t.tags.some((x) => x.toLowerCase().includes(q)),
  );
}
