import type { TodoistItem } from '@shared/domain/todoist';
import type { TaskPriority } from '@shared/types';

/**
 * Fetches active tasks from the Todoist REST API v2. Runs in the main
 * process (no CORS); the pure merge into the workspace happens in
 * shared/domain/todoist.ts on the renderer side.
 */

const API_URL = 'https://api.todoist.com/rest/v2/tasks';

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
    let response;
    try {
      response = await this.fetchImpl(API_URL, {
        headers: { Authorization: `Bearer ${token.trim()}` },
      });
    } catch {
      return { ok: false, error: 'Could not reach Todoist — check your connection' };
    }
    if (response.status === 401 || response.status === 403) {
      return { ok: false, error: 'Todoist rejected the token — check it in Settings' };
    }
    if (!response.ok) {
      return { ok: false, error: `Todoist error (HTTP ${response.status})` };
    }

    const raw = await response.json();
    if (!Array.isArray(raw)) return { ok: false, error: 'Unexpected response from Todoist' };

    const items: TodoistItem[] = [];
    for (const entryRaw of raw as unknown[]) {
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
    return { ok: true, items };
  }
}
