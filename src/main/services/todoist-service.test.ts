import { describe, expect, it, vi } from 'vitest';

import { TodoistService } from './todoist-service';

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

function serviceWith(status: number, body: unknown): TodoistService {
  return new TodoistService(
    vi.fn().mockResolvedValue({
      ok: status >= 200 && status < 300,
      status,
      json: () => Promise.resolve(body),
    }),
  );
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

  it('sends the bearer token to the unified v1 endpoint', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ results: [], next_cursor: null }),
    });
    await new TodoistService(fetchImpl).fetchActiveTasks('  abc123  ');
    expect(fetchImpl).toHaveBeenCalledWith('https://api.todoist.com/api/v1/tasks?limit=200', {
      headers: { Authorization: 'Bearer abc123' },
    });
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
    const result = await new TodoistService(fetchImpl).fetchActiveTasks('t');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.items.map((i) => i.todoistId)).toEqual(['a1', 'b2']);
    expect(fetchImpl).toHaveBeenNthCalledWith(
      2,
      'https://api.todoist.com/api/v1/tasks?limit=200&cursor=CURSOR%2F2%3D%3D',
      { headers: { Authorization: 'Bearer t' } },
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
      error: 'Todoist error (HTTP 500)',
    });
    // A retired API version (what REST v2 now returns) gets a clear message.
    expect(await serviceWith(410, {}).fetchActiveTasks('t')).toMatchObject({
      ok: false,
      error: expect.stringContaining('retired this API version') as string,
    });
    const offline = new TodoistService(vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));
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
