import { describe, expect, it, vi } from 'vitest';

import { TodoistPushService, TodoistService } from './todoist-service';

/** Task shapes recorded from the Todoist unified API v1 /tasks endpoint. */
const TASK_FIXTURE = [
  {
    id: '7654321',
    content: 'Call plumber about kitchen sink',
    description: 'Mention the warranty',
    priority: 3,
    due: { date: '2026-07-09', string: 'tomorrow' },
  },
  {
    id: '7654322',
    content: 'Pick up dry cleaning',
    description: '',
    priority: 1,
    due: null,
  },
  {
    id: 7654323, // numeric ids appear in older exports
    content: 'Renew car registration',
    priority: 4,
    due: { date: '2026-07-14T09:00:00' }, // datetime form
  },
  { id: '7654324', content: '', priority: 2 }, // junk: no title
  'not-an-object',
];

/** v1 responses are cursor-paginated: { results, next_cursor }. */
const API_FIXTURE = { results: TASK_FIXTURE, next_cursor: null };

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
  it('maps API tasks to normalized items', async () => {
    const result = await serviceWith(200, API_FIXTURE).fetchActiveTasks('token123');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.items).toEqual([
      {
        todoistId: '7654321',
        title: 'Call plumber about kitchen sink',
        dueDate: '2026-07-09',
        priority: 'High',
        notes: 'Mention the warranty',
      },
      {
        todoistId: '7654322',
        title: 'Pick up dry cleaning',
        dueDate: null,
        priority: 'Low',
        notes: '',
      },
      {
        todoistId: '7654323',
        title: 'Renew car registration',
        dueDate: '2026-07-14',
        priority: 'Critical',
        notes: '',
      },
    ]);
  });

  it('sends the bearer token, User-Agent, and Accept to the v1 endpoint', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(page({ results: [], next_cursor: null }));
    await new TodoistService(fetchImpl, instantSleep).fetchActiveTasks('  abc123  ');
    expect(fetchImpl).toHaveBeenCalledWith('https://api.todoist.com/api/v1/tasks?limit=200', {
      headers: { ...EXPECTED_HEADERS, Authorization: 'Bearer abc123' },
    });
  });

  it('retries transient failures and succeeds when the service recovers', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(page({ error: 'unavailable' }, 503))
      .mockResolvedValueOnce(
        page({ results: [{ id: 'r1', content: 'Recovered', priority: 1 }], next_cursor: null }),
      );
    const result = await new TodoistService(fetchImpl, instantSleep).fetchActiveTasks('t');
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
      .mockResolvedValueOnce(page({ results: [], next_cursor: null }));
    await new TodoistService(fetchImpl, sleep).fetchActiveTasks('t');
    expect(sleep).toHaveBeenCalledWith(4000);
  });

  it('gives up after three attempts with a temporarily-unavailable message', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(page({ error: 'down' }, 503));
    const result = await new TodoistService(fetchImpl, instantSleep).fetchActiveTasks('t');
    expect(result).toMatchObject({
      ok: false,
      error: 'Todoist is temporarily unavailable (HTTP 503) — try again in a minute',
    });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it('follows next_cursor across pages', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            results: [{ id: 'a1', content: 'Page one task', priority: 1 }],
            next_cursor: 'CURSOR/2==',
          }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            results: [{ id: 'b2', content: 'Page two task', priority: 1 }],
            next_cursor: null,
          }),
      });
    const result = await new TodoistService(fetchImpl, instantSleep).fetchActiveTasks('t');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.items.map((i) => i.todoistId)).toEqual(['a1', 'b2']);
    expect(fetchImpl).toHaveBeenNthCalledWith(
      2,
      'https://api.todoist.com/api/v1/tasks?limit=200&cursor=CURSOR%2F2%3D%3D',
      { headers: EXPECTED_HEADERS },
    );
  });

  it('still accepts a bare-array response (legacy shape)', async () => {
    const result = await serviceWith(200, [
      { id: 'x', content: 'Legacy', priority: 2 },
    ]).fetchActiveTasks('t');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({ todoistId: 'x', priority: 'Medium' });
  });

  it('rejects an empty token without a network call', async () => {
    const fetchImpl = vi.fn();
    const result = await new TodoistService(fetchImpl).fetchActiveTasks('   ');
    expect(result).toMatchObject({ ok: false, error: expect.stringContaining('token') as string });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('maps auth failures, server errors, and network failures to messages', async () => {
    expect(await serviceWith(401, {}).fetchActiveTasks('bad')).toMatchObject({
      ok: false,
      error: expect.stringContaining('rejected the token') as string,
    });
    expect(await serviceWith(500, {}).fetchActiveTasks('t')).toMatchObject({
      ok: false,
      error: 'Todoist is temporarily unavailable (HTTP 500) — try again in a minute',
    });
    // A retired API version (what REST v2 now returns) gets a clear message.
    expect(await serviceWith(410, {}).fetchActiveTasks('t')).toMatchObject({
      ok: false,
      error: expect.stringContaining('retired this API version') as string,
    });
    const offline = new TodoistService(
      vi.fn().mockRejectedValue(new Error('ECONNREFUSED')),
      instantSleep,
    );
    expect(await offline.fetchActiveTasks('t')).toMatchObject({
      ok: false,
      error: expect.stringContaining('Could not reach Todoist') as string,
    });
  });

  it('rejects non-array payloads', async () => {
    expect(await serviceWith(200, { error: 'nope' }).fetchActiveTasks('t')).toMatchObject({
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
