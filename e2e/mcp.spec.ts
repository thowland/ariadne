import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { expect, test } from '@playwright/test';

/**
 * The MCP server as a client actually meets it: the built bundle, spawned as
 * a real process, spoken to over stdin and stdout (D39).
 *
 * The unit suite covers the protocol and the projections. What only this can
 * prove is that the bundle runs standalone with no `node_modules` in reach,
 * that it finds a workspace, and — the failure that would be invisible
 * everywhere else — that nothing but JSON-RPC ever reaches stdout. One stray
 * `console.log` corrupts the stream and the client drops the connection.
 */

const SERVER = join(__dirname, '..', 'out', 'mcp', 'server.mjs');
const FAKE_TODAY = '2026-07-08';

/** A workspace on disk, written the way the app writes one. */
function seededWorkspace(): string {
  const dir = mkdtempSync(join(tmpdir(), 'ariadne-mcp-e2e-'));
  const today = FAKE_TODAY;
  writeFileSync(
    join(dir, 'projects.json'),
    JSON.stringify([
      {
        id: 'p1',
        name: 'Q3 Platform Migration',
        category: 'work',
        tags: ['infra'],
        color: '#4f5bd5',
        status: 'Active',
        notes: '',
        links: [],
        createdAt: today,
      },
    ]),
    'utf8',
  );
  writeFileSync(
    join(dir, 'tasks.json'),
    JSON.stringify([
      {
        id: 't1',
        projectId: 'p1',
        title: 'Migrate auth service',
        status: 'Todo',
        priority: 'Critical',
        tags: [],
        notes: '',
        dueDate: '2026-07-01',
        dependsOn: [],
        subtasks: [],
        links: [],
        createdAt: today,
        completedAt: null,
        estimateHours: 16,
        contactIds: ['c1'],
      },
    ]),
    'utf8',
  );
  writeFileSync(
    join(dir, 'contacts.json'),
    JSON.stringify([
      {
        id: 'c1',
        firstName: 'Dana',
        lastName: 'Reyes',
        company: 'Northwind Systems',
        department: 'Platform',
        role: 'Platform Lead',
        email: 'dana@northwind.example',
        phone: '(555) 214-8890',
        notes: '',
        tags: [],
        createdAt: today,
      },
    ]),
    'utf8',
  );
  // Deliberately present, and deliberately never read: it holds credentials.
  writeFileSync(
    join(dir, 'settings.json'),
    JSON.stringify({ todoistToken: 'SECRET-TOKEN', anthropicApiKey: 'sk-SECRET' }),
    'utf8',
  );
  return dir;
}

interface Exchange {
  responses: Record<string, unknown>[];
  stdout: string;
  stderr: string;
}

/** Sends each line to a fresh server and collects everything it emits. */
async function converse(lines: unknown[], dataDir: string): Promise<Exchange> {
  const child = spawn(process.execPath, [SERVER], {
    env: { ...process.env, ARIADNE_DATA_DIR: dataDir, ARIADNE_FAKE_TODAY: FAKE_TODAY },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (d: Buffer) => (stdout += d.toString()));
  child.stderr.on('data', (d: Buffer) => (stderr += d.toString()));
  for (const line of lines) child.stdin.write(`${JSON.stringify(line)}\n`);
  child.stdin.end();
  await new Promise((done) => child.on('close', done));
  return {
    stdout,
    stderr,
    responses: stdout
      .split('\n')
      .filter((l) => l.trim() !== '')
      .map((l) => JSON.parse(l) as Record<string, unknown>),
  };
}

const HANDSHAKE = [
  {
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'e2e' } },
  },
  { jsonrpc: '2.0', method: 'notifications/initialized' },
];

test('the built server completes a handshake and lists its tools', async () => {
  const { responses, stderr } = await converse(
    [...HANDSHAKE, { jsonrpc: '2.0', id: 2, method: 'tools/list' }],
    seededWorkspace(),
  );

  // Two requests, two replies: the notification must not have been answered.
  expect(responses).toHaveLength(2);
  expect(responses[0]).toMatchObject({ id: 1, result: { serverInfo: { name: 'ariadne' } } });
  const tools = (responses[1]?.result as { tools: { name: string }[] }).tools;
  expect(tools.map((t) => t.name)).toContain('ariadne_briefing');
  // Diagnostics belong on stderr, where a client shows them as logs.
  expect(stderr).toContain('read-only on');
});

test('it answers real questions about a workspace on disk', async () => {
  const dataDir = seededWorkspace();
  const { responses } = await converse(
    [
      ...HANDSHAKE,
      { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'ariadne_briefing' } },
      {
        jsonrpc: '2.0',
        id: 3,
        method: 'tools/call',
        params: { name: 'ariadne_contact', arguments: { contact: 'dana' } },
      },
    ],
    dataDir,
  );

  const read = (id: number): unknown => {
    const message = responses.find((r) => r.id === id);
    const result = message?.result as { content: { text: string }[] };
    return JSON.parse(result.content[0]?.text ?? '{}');
  };

  const briefing = read(2) as {
    counts: { overdue: number };
    overdue: Record<string, unknown>[];
  };
  expect(briefing.counts.overdue).toBe(1);
  expect(briefing.overdue[0]).toMatchObject({
    title: 'Migrate auth service',
    project: 'Q3 Platform Migration',
    overdue: true,
    estimate: '2d',
  });

  const dana = read(3) as { name: string; email: string; tasks: { title: string }[] };
  expect(dana.name).toBe('Dana Reyes');
  expect(dana.email).toBe('dana@northwind.example');
  expect(dana.tasks[0]?.title).toBe('Migrate auth service');
});

test('nothing but JSON-RPC ever reaches stdout, and no secret ever leaves', async () => {
  const dataDir = seededWorkspace();
  const { stdout } = await converse(
    [
      ...HANDSHAKE,
      { jsonrpc: '2.0', id: 2, method: 'ariadne_nonsense' },
      { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'ariadne_workspace_info' } },
      {
        jsonrpc: '2.0',
        id: 4,
        method: 'tools/call',
        params: { name: 'ariadne_search', arguments: { query: 'dana' } },
      },
    ],
    dataDir,
  );

  for (const line of stdout.split('\n').filter((l) => l.trim() !== '')) {
    // Every single line must parse as a JSON-RPC message.
    const message = JSON.parse(line) as { jsonrpc: string };
    expect(message.jsonrpc).toBe('2.0');
  }
  // settings.json sat right next to the data the whole time.
  expect(stdout).not.toContain('SECRET');
  expect(stdout).not.toContain('todoistToken');
});

test('it says what to do when there is no workspace to read', async () => {
  const empty = mkdtempSync(join(tmpdir(), 'ariadne-mcp-none-'));
  const child = spawn(process.execPath, [SERVER], {
    // No ARIADNE_DATA_DIR and a HOME with nothing in it: nothing to find.
    env: { PATH: process.env.PATH, HOME: empty, USERPROFILE: empty },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  let stderr = '';
  child.stderr.on('data', (d: Buffer) => (stderr += d.toString()));
  const code = await new Promise<number | null>((done) => child.on('close', done));

  expect(code).toBe(1);
  expect(stderr).toContain('ARIADNE_DATA_DIR');
});
