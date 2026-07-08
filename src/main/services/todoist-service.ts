import type { TodoistItem } from '@shared/domain/todoist';
import type { TaskPriority } from '@shared/types';

/**
 * Fetches active tasks from Todoist's unified API v1 (the REST v2 API was
 * retired upstream and now answers 410 Gone). Runs in the main process (no
 * CORS); the pure merge into the workspace happens in
 * shared/domain/todoist.ts on the renderer side.
 */

const API_URL = 'https://api.todoist.com/api/v1/tasks';
const PAGE_LIMIT = 200;
// Paranoia cap: 50 pages × 200 tasks is far beyond any personal inbox.
const MAX_PAGES = 50;

/** Todoist priority: 4 = urgent (p1 in the apps) … 1 = normal (p4). */
const PRIORITY_MAP: Record<number, TaskPriority> = {
  4: 'Critical',
  3: 'High',
  2: 'Medium',
  1: 'Low',
};

interface TodoistApiTask {
  id?: unknown;
  content?: unknown;
  description?: unknown;
  priority?: unknown;
  due?: { date?: unknown } | null;
}

export type TodoistFetchResult = { ok: true; items: TodoistItem[] } | { ok: false; error: string };

type FetchLike = (
  url: string,
  init: { headers: Record<string, string> },
) => Promise<{
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}>;

export class TodoistService {
  constructor(private readonly fetchImpl: FetchLike = fetch) {}

  async fetchActiveTasks(token: string): Promise<TodoistFetchResult> {
    if (token.trim() === '') return { ok: false, error: 'Add your Todoist API token first' };

    const items: TodoistItem[] = [];
    let cursor: string | null = null;

    for (let page = 0; page < MAX_PAGES; page++) {
      const url =
        `${API_URL}?limit=${String(PAGE_LIMIT)}` +
        (cursor !== null ? `&cursor=${encodeURIComponent(cursor)}` : '');
      let response;
      try {
        response = await this.fetchImpl(url, {
          headers: { Authorization: `Bearer ${token.trim()}` },
        });
      } catch {
        return { ok: false, error: 'Could not reach Todoist — check your connection' };
      }
      if (response.status === 401 || response.status === 403) {
        return { ok: false, error: 'Todoist rejected the token — check it in Settings' };
      }
      if (response.status === 410) {
        return {
          ok: false,
          error: 'Todoist retired this API version — please update Ariadne',
        };
      }
      if (!response.ok) {
        return { ok: false, error: `Todoist error (HTTP ${String(response.status)})` };
      }

      const raw = await response.json();
      // Unified v1 pages: { results: [...], next_cursor: string | null }.
      // A bare array is accepted defensively (old REST v2 shape).
      let pageTasks: unknown[];
      if (Array.isArray(raw)) {
        pageTasks = raw as unknown[];
        cursor = null;
      } else if (
        typeof raw === 'object' &&
        raw !== null &&
        Array.isArray((raw as Record<string, unknown>).results)
      ) {
        const doc = raw as { results: unknown[]; next_cursor?: unknown };
        pageTasks = doc.results;
        cursor =
          typeof doc.next_cursor === 'string' && doc.next_cursor !== '' ? doc.next_cursor : null;
      } else {
        return { ok: false, error: 'Unexpected response from Todoist' };
      }

      for (const entryRaw of pageTasks) {
        if (typeof entryRaw !== 'object' || entryRaw === null) continue;
        const entry = entryRaw as TodoistApiTask;
        const id =
          typeof entry.id === 'string' || typeof entry.id === 'number' ? String(entry.id) : null;
        const title = typeof entry.content === 'string' ? entry.content : '';
        if (id === null || title === '') continue;
        const dueRaw = entry.due?.date;
        items.push({
          todoistId: id,
          title,
          dueDate:
            typeof dueRaw === 'string' && /^\d{4}-\d{2}-\d{2}/.test(dueRaw)
              ? dueRaw.slice(0, 10)
              : null,
          priority: PRIORITY_MAP[typeof entry.priority === 'number' ? entry.priority : 1] ?? 'Low',
          notes: typeof entry.description === 'string' ? entry.description : '',
        });
      }

      if (cursor === null) break;
    }

    return { ok: true, items };
  }
}
