import { describe, expect, it, vi } from 'vitest';

import { TodoistPushService, TodoistService } from './todoist-service';

/** Item shapes from the v1 /tasks/completed/by_completion_date endpoint. */
const COMPLETED_FIXTURE = [
  // Noon UTC keeps the local calendar date stable in any test timezone.
  { id: '7654321', content: 'Call plumber', completed_at: '2026-07-07T12:00:00Z' },
  { id: 7654322, completed_at: '2026-07-06T12:00:00.000000Z' }, // numeric id
  { task_id: 'sync99', completed_at: null }, // sync-shaped entry, no timestamp
  { completed_at: '2026-07-05T12:00:00Z' }, // junk: no id
  'not-an-object',
];

/** Documented response shape: { items, next_cursor }. */
const API_FIXTURE = { items: COMPLETED_FIXTURE, next_cursor: null };

const SINCE = '2026-06-08T12:00:00.000Z';
const UNTIL = '2026-07-08T12:00:00.000Z';
const WINDOW = `since=${encodeURIComponent(SINCE)}&until=${encodeURIComponent(UNTIL)}`;

const EXPECTED_HEADERS = {
  Authorization: 'Bearer t',
  'User-Agent': 'Ariadne-Tracker (Electron; +https://github.com/wdogsystems/ariadne)',
  Accept: 'application/json',
};

const instantSleep = (): Promise<void> => Promise.resolve();

function page(
  body: unknown,
  status = 200,
): { ok: boolean; status: number; json(): Promise<unknown> } {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  };
}

function serviceWith(status: number, body: unknown): TodoistService {
  return new TodoistService(vi.fn().mockResolvedValue(page(body, status)), instantSleep);
}

describe('TodoistService', () => {
  it('maps completed items to { todoistId, completedDate }, skipping junk', async () => {
    const result = await serviceWith(200, API_FIXTURE).fetchCompleted('token123', SINCE, UNTIL);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.items).toEqual([
      { todoistId: '7654321', completedDate: '2026-07-07' },
      { todoistId: '7654322', completedDate: '2026-07-06' },
      { todoistId: 'sync99', completedDate: null },
    ]);
  });

  it('sends the bearer token, User-Agent, and the window to the completed endpoint', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(page({ items: [], next_cursor: null }));
    await new TodoistService(fetchImpl, instantSleep).fetchCompleted('  abc123  ', SINCE, UNTIL);
    expect(fetchImpl).toHaveBeenCalledWith(
      `https://api.todoist.com/api/v1/tasks/completed/by_completion_date?${WINDOW}&limit=200`,
      { headers: { ...EXPECTED_HEADERS, Authorization: 'Bearer abc123' } },
    );
  });

  it('retries transient failures and succeeds when the service recovers', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(page({ error: 'unavailable' }, 503))
      .mockResolvedValueOnce(
        page({ items: [{ id: 'r1', completed_at: null }], next_cursor: null }),
      );
    const result = await new TodoistService(fetchImpl, instantSleep).fetchCompleted(
      't',
      SINCE,
      UNTIL,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.items.map((i) => i.todoistId)).toEqual(['r1']);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('honors the retry_after hint between attempts', async () => {
    const sleep = vi.fn().mockResolvedValue(undefined);
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(page({ error_extra: { retry_after: 4 } }, 429))
      .mockResolvedValueOnce(page({ items: [], next_cursor: null }));
    await new TodoistService(fetchImpl, sleep).fetchCompleted('t', SINCE, UNTIL);
    expect(sleep).toHaveBeenCalledWith(4000);
  });

  it('gives up after three attempts with a temporarily-unavailable message', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(page({ error: 'down' }, 503));
    const result = await new TodoistService(fetchImpl, instantSleep).fetchCompleted(
      't',
      SINCE,
      UNTIL,
    );
    expect(result).toMatchObject({
      ok: false,
      error: 'Todoist is temporarily unavailable (HTTP 503) — try again in a minute',
    });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it('follows next_cursor across pages', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        page({ items: [{ id: 'a1', completed_at: null }], next_cursor: 'CURSOR/2==' }),
      )
      .mockResolvedValueOnce(
        page({ items: [{ id: 'b2', completed_at: null }], next_cursor: null }),
      );
    const result = await new TodoistService(fetchImpl, instantSleep).fetchCompleted(
      't',
      SINCE,
      UNTIL,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.items.map((i) => i.todoistId)).toEqual(['a1', 'b2']);
    expect(fetchImpl).toHaveBeenNthCalledWith(
      2,
      `https://api.todoist.com/api/v1/tasks/completed/by_completion_date?${WINDOW}&limit=200&cursor=CURSOR%2F2%3D%3D`,
      { headers: EXPECTED_HEADERS },
    );
  });

  it('accepts a { results } page shape defensively', async () => {
    const result = await serviceWith(200, {
      results: [{ id: 'x', completed_at: '2026-07-01T12:00:00Z' }],
      next_cursor: null,
    }).fetchCompleted('t', SINCE, UNTIL);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.items).toEqual([{ todoistId: 'x', completedDate: '2026-07-01' }]);
  });

  it('rejects an empty token without a network call', async () => {
    const fetchImpl = vi.fn();
    const result = await new TodoistService(fetchImpl).fetchCompleted('   ', SINCE, UNTIL);
    expect(result).toMatchObject({ ok: false, error: expect.stringContaining('token') as string });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('maps auth failures, server errors, and network failures to messages', async () => {
    expect(await serviceWith(401, {}).fetchCompleted('bad', SINCE, UNTIL)).toMatchObject({
      ok: false,
      error: expect.stringContaining('rejected the token') as string,
    });
    expect(await serviceWith(500, {}).fetchCompleted('t', SINCE, UNTIL)).toMatchObject({
      ok: false,
      error: 'Todoist is temporarily unavailable (HTTP 500) — try again in a minute',
    });
    // A retired API version (what REST v2 now returns) gets a clear message.
    expect(await serviceWith(410, {}).fetchCompleted('t', SINCE, UNTIL)).toMatchObject({
      ok: false,
      error: expect.stringContaining('retired this API version') as string,
    });
    const offline = new TodoistService(
      vi.fn().mockRejectedValue(new Error('ECONNREFUSED')),
      instantSleep,
    );
    expect(await offline.fetchCompleted('t', SINCE, UNTIL)).toMatchObject({
      ok: false,
      error: expect.stringContaining('Could not reach Todoist') as string,
    });
  });

  it('rejects payloads without an item array', async () => {
    expect(
      await serviceWith(200, { error: 'nope' }).fetchCompleted('t', SINCE, UNTIL),
    ).toMatchObject({
      ok: false,
      error: 'Unexpected response from Todoist',
    });
    expect(await serviceWith(200, 'nope').fetchCompleted('t', SINCE, UNTIL)).toMatchObject({
      ok: false,
      error: 'Unexpected response from Todoist',
    });
  });
});

describe('TodoistPushService', () => {
  const CANDIDATE = {
    taskId: 't6',
    content: 'Write migration runbook',
    description: 'Step by step',
    dueDate: '2026-07-08',
    priority: 2,
    targetProject: 'Work' as const,
    labels: ['Q3-Platform-Migration', 'ariadne'],
  };

  function pushService(fetchImpl: ReturnType<typeof vi.fn>): TodoistPushService {
    let n = 0;
    return new TodoistPushService(
      new TodoistService(fetchImpl, instantSleep),
      fetchImpl,
      () => `req-${String(++n)}`,
    );
  }

  it('reuses an existing Todoist project and creates the task with labels', async () => {
    const fetchImpl = vi
      .fn()
      // GET /projects
      .mockResolvedValueOnce(
        page({ results: [{ id: 'proj-work', name: 'Work' }], next_cursor: null }),
      )
      // POST /tasks
      .mockResolvedValueOnce(page({ id: 'new-task-1' }));
    const result = await pushService(fetchImpl).pushTasks('tok', [CANDIDATE]);
    expect(result).toEqual({
      ok: true,
      pushed: [{ taskId: 't6', todoistId: 'new-task-1' }],
      failed: 0,
    });

    const [url, init] = fetchImpl.mock.calls[1] as [
      string,
      { method: string; headers: Record<string, string>; body: string },
    ];
    expect(url).toBe('https://api.todoist.com/api/v1/tasks');
    expect(init.method).toBe('POST');
    expect(init.headers['X-Request-Id']).toBe('req-1');
    expect(init.headers['Content-Type']).toBe('application/json');
    expect(JSON.parse(init.body)).toEqual({
      content: 'Write migration runbook',
      description: 'Step by step',
      project_id: 'proj-work',
      due_date: '2026-07-08',
      priority: 2,
      labels: ['Q3-Platform-Migration', 'ariadne'],
    });
  });

  it('omits due_date entirely for an undated candidate', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        page({ results: [{ id: 'proj-work', name: 'Work' }], next_cursor: null }),
      )
      .mockResolvedValueOnce(page({ id: 'new-task-1' }));
    const result = await pushService(fetchImpl).pushTasks('tok', [{ ...CANDIDATE, dueDate: null }]);
    expect(result).toMatchObject({ ok: true, failed: 0 });
    const [, init] = fetchImpl.mock.calls[1] as [string, { body: string }];
    expect(JSON.parse(init.body)).not.toHaveProperty('due_date');
  });

  it('creates the #Home/#Work project when missing (case-insensitive match)', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(page({ results: [{ id: 'p9', name: 'work' }], next_cursor: null }))
      // POST /projects for Home
      .mockResolvedValueOnce(page({ id: 'proj-home', name: 'Home' }))
      .mockResolvedValueOnce(page({ id: 'task-a' }))
      .mockResolvedValueOnce(page({ id: 'task-b' }));
    const result = await pushService(fetchImpl).pushTasks('tok', [
      CANDIDATE,
      { ...CANDIDATE, taskId: 't9', targetProject: 'Home' as const },
    ]);
    expect(result.ok && result.pushed).toHaveLength(2);
    const projectCreate = fetchImpl.mock.calls[1] as [string, { body: string }];
    expect(projectCreate[0]).toBe('https://api.todoist.com/api/v1/projects');
    expect(JSON.parse(projectCreate[1].body)).toEqual({ name: 'Home' });
    // 'Work' matched the existing lowercase project — only Home was created.
    expect(fetchImpl).toHaveBeenCalledTimes(4);
  });

  it('counts per-task failures but aborts on auth errors', async () => {
    const failing = vi
      .fn()
      .mockResolvedValueOnce(page({ results: [{ id: 'w', name: 'Work' }], next_cursor: null }))
      .mockResolvedValueOnce(page({ error: 'bad request' }, 400))
      .mockResolvedValueOnce(page({ id: 'ok-task' }));
    const result = await pushService(failing).pushTasks('tok', [
      CANDIDATE,
      { ...CANDIDATE, taskId: 't7' },
    ]);
    expect(result).toMatchObject({ ok: true, failed: 1 });
    expect(result.ok && result.pushed).toEqual([{ taskId: 't7', todoistId: 'ok-task' }]);

    const auth = vi
      .fn()
      .mockResolvedValueOnce(page({ results: [{ id: 'w', name: 'Work' }], next_cursor: null }))
      .mockResolvedValue(page({}, 401));
    const rejected = await pushService(auth).pushTasks('tok', [CANDIDATE]);
    expect(rejected).toMatchObject({
      ok: false,
      error: expect.stringContaining('rejected the token') as string,
    });
  });

  it('retries transient task-create failures with the same X-Request-Id', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(page({ results: [{ id: 'w', name: 'Work' }], next_cursor: null }))
      .mockResolvedValueOnce(page({ error: 'blip' }, 503))
      .mockResolvedValueOnce(page({ id: 'recovered' }));
    const result = await pushService(fetchImpl).pushTasks('tok', [CANDIDATE]);
    expect(result.ok && result.pushed[0]?.todoistId).toBe('recovered');
    const first = fetchImpl.mock.calls[1] as [string, { headers: Record<string, string> }];
    const second = fetchImpl.mock.calls[2] as [string, { headers: Record<string, string> }];
    expect(first[1].headers['X-Request-Id']).toBe(second[1].headers['X-Request-Id']);
  });

  it('short-circuits empty pushes and missing tokens', async () => {
    const fetchImpl = vi.fn();
    expect(await pushService(fetchImpl).pushTasks('tok', [])).toEqual({
      ok: true,
      pushed: [],
      failed: 0,
    });
    expect(await pushService(fetchImpl).pushTasks('  ', [CANDIDATE])).toMatchObject({ ok: false });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
