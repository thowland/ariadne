import { newId } from '@shared/domain/id';
import type { TodoistItem, TodoistPushCandidate } from '@shared/domain/todoist';
import type { TaskPriority } from '@shared/types';

/**
 * Fetches active tasks from Todoist's unified API v1 (the REST v2 API was
 * retired upstream and now answers 410 Gone). Runs in the main process (no
 * CORS); the pure merge into the workspace happens in
 * shared/domain/todoist.ts on the renderer side.
 */

const API_BASE = 'https://api.todoist.com/api/v1';
const API_URL = `${API_BASE}/tasks`;
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
  init: { method?: string; headers: Record<string, string>; body?: string },
) => Promise<{
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}>;

type FetchInit = Parameters<FetchLike>[1];

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
  private fetchWithRetry(url: string, init: FetchInit): Promise<Awaited<ReturnType<FetchLike>>> {
    return this.fetchWithRetryUsing(this.fetchImpl, url, init);
  }

  /** Public seam for the push service (same identity + auth headers). */
  headersFor(token: string): Record<string, string> {
    return this.headers(token);
  }

  /** Public seam for the push service: retry using a caller's fetch impl. */
  retry(
    url: string,
    init: FetchInit,
    fetchImpl?: FetchLike,
  ): Promise<Awaited<ReturnType<FetchLike>>> {
    return this.fetchWithRetryUsing(fetchImpl ?? this.fetchImpl, url, init);
  }

  private async fetchWithRetryUsing(
    fetchImpl: FetchLike,
    url: string,
    init: FetchInit,
  ): Promise<Awaited<ReturnType<FetchLike>>> {
    let response = await fetchImpl(url, init);
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
      response = await fetchImpl(url, init);
    }
    return response;
  }

  /** Public seam for the push service. */
  fatalFor(status: number): string | null {
    return this.fatalError(status);
  }

  private headers(token: string): Record<string, string> {
    return {
      Authorization: `Bearer ${token.trim()}`,
      'User-Agent': 'Ariadne-Tracker (Electron; +https://github.com/wdogsystems/ariadne)',
      Accept: 'application/json',
    };
  }

  /** Shared fatal-status mapping; null means the response is usable. */
  private fatalError(status: number): string | null {
    if (status === 401 || status === 403) {
      return 'Todoist rejected the token — check it in Settings';
    }
    if (status === 410) return 'Todoist retired this API version — please update Ariadne';
    if (RETRYABLE.has(status)) {
      return `Todoist is temporarily unavailable (HTTP ${String(status)}) — try again in a minute`;
    }
    return null;
  }

  async fetchActiveTasks(token: string): Promise<TodoistFetchResult> {
    if (token.trim() === '') return { ok: false, error: 'Add your Todoist API token first' };

    const items: TodoistItem[] = [];
    let cursor: string | null = null;
    // Some CDN edges throttle or challenge requests with no User-Agent
    // (Node's fetch sends none by default) — identify ourselves.
    const headers = this.headers(token);

    for (let page = 0; page < MAX_PAGES; page++) {
      const url =
        `${API_URL}?limit=${String(PAGE_LIMIT)}` +
        (cursor !== null ? `&cursor=${encodeURIComponent(cursor)}` : '');
      let response;
      try {
        response = await this.fetchWithRetry(url, { headers });
      } catch {
        return { ok: false, error: 'Could not reach Todoist — check your connection' };
      }
      const fatal = this.fatalError(response.status);
      if (fatal !== null) return { ok: false, error: fatal };
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

export type TodoistPushResult =
  | { ok: true; pushed: { taskId: string; todoistId: string }[]; failed: number }
  | { ok: false; error: string };

interface TodoistApiProject {
  id?: unknown;
  name?: unknown;
}

export class TodoistPushService {
  constructor(
    private readonly service: TodoistService,
    private readonly fetchImpl: FetchLike = fetch,
    private readonly requestId: () => string = newId,
  ) {}

  /**
   * Push tasks into Todoist: file each under a #Home / #Work Todoist project
   * (found or created by name) with its labels. Each create carries an
   * X-Request-Id so retried POSTs are idempotent on Todoist's side.
   */
  async pushTasks(
    token: string,
    items: readonly TodoistPushCandidate[],
  ): Promise<TodoistPushResult> {
    if (token.trim() === '') return { ok: false, error: 'Add your Todoist API token first' };
    if (items.length === 0) return { ok: true, pushed: [], failed: 0 };
    const headers = this.service.headersFor(token);

    // Resolve (or create) the target Todoist projects by name.
    const wanted = new Set(items.map((i) => i.targetProject));
    const projectIds = new Map<string, string>();
    let cursor: string | null = null;
    for (let page = 0; page < 50; page++) {
      const url =
        `${API_BASE}/projects?limit=200` +
        (cursor !== null ? `&cursor=${encodeURIComponent(cursor)}` : '');
      let response;
      try {
        response = await this.service.retry(url, { headers }, this.fetchImpl);
      } catch {
        return { ok: false, error: 'Could not reach Todoist — check your connection' };
      }
      const fatal = this.service.fatalFor(response.status);
      if (fatal !== null) return { ok: false, error: fatal };
      if (!response.ok) {
        return { ok: false, error: `Todoist error (HTTP ${String(response.status)})` };
      }
      const raw = await response.json();
      const doc = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {};
      const results = Array.isArray(doc.results)
        ? (doc.results as unknown[])
        : Array.isArray(raw)
          ? (raw as unknown[])
          : [];
      for (const entry of results) {
        if (typeof entry !== 'object' || entry === null) continue;
        const project = entry as TodoistApiProject;
        if (
          typeof project.name === 'string' &&
          (typeof project.id === 'string' || typeof project.id === 'number')
        ) {
          projectIds.set(project.name.toLowerCase(), String(project.id));
        }
      }
      cursor =
        typeof doc.next_cursor === 'string' && doc.next_cursor !== '' ? doc.next_cursor : null;
      if (cursor === null) break;
    }

    for (const name of wanted) {
      if (projectIds.has(name.toLowerCase())) continue;
      let response;
      try {
        response = await this.service.retry(
          `${API_BASE}/projects`,
          {
            method: 'POST',
            headers: {
              ...headers,
              'Content-Type': 'application/json',
              'X-Request-Id': this.requestId(),
            },
            body: JSON.stringify({ name }),
          },
          this.fetchImpl,
        );
      } catch {
        return { ok: false, error: 'Could not reach Todoist — check your connection' };
      }
      const fatal = this.service.fatalFor(response.status);
      if (fatal !== null) return { ok: false, error: fatal };
      if (!response.ok) {
        return {
          ok: false,
          error: `Could not create Todoist project "${name}" (HTTP ${String(response.status)})`,
        };
      }
      const created = (await response.json()) as TodoistApiProject;
      if (typeof created.id === 'string' || typeof created.id === 'number') {
        projectIds.set(name.toLowerCase(), String(created.id));
      } else {
        return { ok: false, error: `Could not create Todoist project "${name}"` };
      }
    }

    // Create the tasks, one by one (small N; keeps rate limits happy).
    const pushed: { taskId: string; todoistId: string }[] = [];
    let failed = 0;
    for (const item of items) {
      const projectId = projectIds.get(item.targetProject.toLowerCase());
      if (projectId === undefined) {
        failed += 1;
        continue;
      }
      let response;
      try {
        response = await this.service.retry(
          API_URL,
          {
            method: 'POST',
            headers: {
              ...headers,
              'Content-Type': 'application/json',
              'X-Request-Id': this.requestId(),
            },
            body: JSON.stringify({
              content: item.content,
              description: item.description,
              project_id: projectId,
              due_date: item.dueDate,
              priority: item.priority,
              labels: item.labels,
            }),
          },
          this.fetchImpl,
        );
      } catch {
        failed += 1;
        continue;
      }
      const fatal = this.service.fatalFor(response.status);
      // Auth/deprecation problems will hit every task — stop with the message.
      if (response.status === 401 || response.status === 403 || response.status === 410) {
        return { ok: false, error: fatal ?? 'Todoist rejected the request' };
      }
      if (!response.ok) {
        failed += 1;
        continue;
      }
      const created = (await response.json()) as TodoistApiTask;
      if (typeof created.id === 'string' || typeof created.id === 'number') {
        pushed.push({ taskId: item.taskId, todoistId: String(created.id) });
      } else {
        failed += 1;
      }
    }
    return { ok: true, pushed, failed };
  }
}
