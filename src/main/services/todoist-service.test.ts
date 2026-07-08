import { describe, expect, it, vi } from 'vitest';

import { TodoistService } from './todoist-service';

/** Shape recorded from the Todoist REST v2 /tasks endpoint. */
const API_FIXTURE = [
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

  it('sends the bearer token', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve([]),
    });
    await new TodoistService(fetchImpl).fetchActiveTasks('  abc123  ');
    expect(fetchImpl).toHaveBeenCalledWith('https://api.todoist.com/rest/v2/tasks', {
      headers: { Authorization: 'Bearer abc123' },
    });
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
