import { toIsoDate } from '@shared/domain/dates';
import { newId } from '@shared/domain/id';
import type { TodoistCompletion, TodoistPushCandidate } from '@shared/domain/todoist';

/**
 * Talks to Todoist's unified API v1 (the REST v2 API was retired upstream and
 * now answers 410 Gone). Runs in the main process (no CORS). Two jobs: fetch
 * recently completed items for the completion sync (D17), and push tasks out.
 * The pure workspace mutations happen in shared/domain/todoist.ts on the
 * renderer side.
 */

const API_BASE = 'https://api.todoist.com/api/v1';
const API_URL = `${API_BASE}/tasks`;
const COMPLETED_URL = `${API_BASE}/tasks/completed/by_completion_date`;
const PAGE_LIMIT = 200;
// Paranoia cap: 50 pages × 200 tasks is far beyond any personal account.
const MAX_PAGES = 50;

interface TodoistApiTask {
  id?: unknown;
  task_id?: unknown;
  completed_at?: unknown;
}

export type TodoistCompletedResult =
  { ok: true; items: TodoistCompletion[] } | { ok: false; error: string };

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

/**
 * Body parse that never throws: an HTTP 200 carrying a non-JSON body (captive
 * portal, intercepting proxy) must surface as a clean error, not an unhandled
 * rejection escaping through the IPC handler.
 */
async function jsonBody(response: { json(): Promise<unknown> }): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

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

  /**
   * Completed items in [since, until) by completion date (unified v1 pages:
   * `{ items: [...], next_cursor }`). Todoist caps the window at 3 months;
   * callers pass the D17 lookback. `completed_at` is UTC — it is converted to
   * the machine's local calendar date here, at the edge.
   */
  async fetchCompleted(
    token: string,
    since: string,
    until: string,
  ): Promise<TodoistCompletedResult> {
    if (token.trim() === '') return { ok: false, error: 'Add your Todoist API token first' };

    const items: TodoistCompletion[] = [];
    let cursor: string | null = null;
    // Some CDN edges throttle or challenge requests with no User-Agent
    // (Node's fetch sends none by default) — identify ourselves.
    const headers = this.headers(token);

    for (let page = 0; page < MAX_PAGES; page++) {
      const url =
        `${COMPLETED_URL}?since=${encodeURIComponent(since)}&until=${encodeURIComponent(until)}` +
        `&limit=${String(PAGE_LIMIT)}` +
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

      const raw = await jsonBody(response);
      // Documented shape is { items: [...] }; accept { results: [...] } too.
      let pageItems: unknown[];
      if (typeof raw === 'object' && raw !== null) {
        const doc = raw as { items?: unknown; results?: unknown; next_cursor?: unknown };
        if (Array.isArray(doc.items)) pageItems = doc.items;
        else if (Array.isArray(doc.results)) pageItems = doc.results;
        else return { ok: false, error: 'Unexpected response from Todoist' };
        cursor =
          typeof doc.next_cursor === 'string' && doc.next_cursor !== '' ? doc.next_cursor : null;
      } else {
        return { ok: false, error: 'Unexpected response from Todoist' };
      }

      for (const entryRaw of pageItems) {
        if (typeof entryRaw !== 'object' || entryRaw === null) continue;
        const entry = entryRaw as TodoistApiTask;
        const idRaw = entry.id ?? entry.task_id;
        const id = typeof idRaw === 'string' || typeof idRaw === 'number' ? String(idRaw) : null;
        if (id === null) continue;
        const at = typeof entry.completed_at === 'string' ? Date.parse(entry.completed_at) : NaN;
        items.push({
          todoistId: id,
          completedDate: Number.isNaN(at) ? null : toIsoDate(new Date(at)),
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
      const raw = await jsonBody(response);
      // An unreadable project list must abort: treating it as empty would
      // recreate (duplicate) the #Home/#Work projects below.
      if (typeof raw !== 'object' || raw === null) {
        return { ok: false, error: 'Unexpected response from Todoist' };
      }
      const doc = raw as Record<string, unknown>;
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
      const created = (await jsonBody(response)) as TodoistApiProject | null;
      if (created !== null && (typeof created.id === 'string' || typeof created.id === 'number')) {
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
              // Undated single-task pushes must omit due_date entirely.
              ...(item.dueDate !== null ? { due_date: item.dueDate } : {}),
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
      const created = (await jsonBody(response)) as TodoistApiTask | null;
      if (created !== null && (typeof created.id === 'string' || typeof created.id === 'number')) {
        pushed.push({ taskId: item.taskId, todoistId: String(created.id) });
      } else {
        failed += 1;
      }
    }
    return { ok: true, pushed, failed };
  }
}
