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

type SleepLike = (ms: number) => Promise<void>;

const defaultSleep: SleepLike = (ms) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

/** Transient statuses worth retrying (rate limit / upstream blips). */
const RETRYABLE = new Set([429, 500, 502, 503, 504]);
const MAX_ATTEMPTS = 3;
const MAX_RETRY_DELAY_MS = 15_000;

export class TodoistService {
  constructor(
    private readonly fetchImpl: FetchLike = fetch,
    private readonly sleep: SleepLike = defaultSleep,
  ) {}

  /**
   * Fetch one page, retrying transient failures with backoff. Todoist's
   * error bodies carry a retry_after (seconds) hint, which wins over the
   * default exponential delay when present.
   */
  private async fetchWithRetry(
    url: string,
    headers: Record<string, string>,
  ): Promise<Awaited<ReturnType<FetchLike>>> {
    let response = await this.fetchImpl(url, { headers });
    for (let attempt = 1; attempt < MAX_ATTEMPTS && RETRYABLE.has(response.status); attempt++) {
      let delayMs = 1000 * 2 ** (attempt - 1);
      try {
        const body = (await response.json()) as { error_extra?: { retry_after?: unknown } };
        const hinted = body.error_extra?.retry_after;
        if (typeof hinted === 'number' && hinted > 0) delayMs = hinted * 1000;
      } catch {
        // No parseable hint — keep the default backoff.
      }
      await this.sleep(Math.min(delayMs, MAX_RETRY_DELAY_MS));
      response = await this.fetchImpl(url, { headers });
    }
    return response;
  }

  async fetchActiveTasks(token: string): Promise<TodoistFetchResult> {
    if (token.trim() === '') return { ok: false, error: 'Add your Todoist API token first' };

    const items: TodoistItem[] = [];
    let cursor: string | null = null;
    // Some CDN edges throttle or challenge requests with no User-Agent
    // (Node's fetch sends none by default) — identify ourselves.
    const headers = {
      Authorization: `Bearer ${token.trim()}`,
      'User-Agent': 'Ariadne-Tracker (Electron; +https://github.com/wdogsystems/ariadne)',
      Accept: 'application/json',
    };

    for (let page = 0; page < MAX_PAGES; page++) {
      const url =
        `${API_URL}?limit=${String(PAGE_LIMIT)}` +
        (cursor !== null ? `&cursor=${encodeURIComponent(cursor)}` : '');
      let response;
      try {
        response = await this.fetchWithRetry(url, headers);
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
      if (RETRYABLE.has(response.status)) {
        return {
          ok: false,
          error: `Todoist is temporarily unavailable (HTTP ${String(response.status)}) — try again in a minute`,
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
