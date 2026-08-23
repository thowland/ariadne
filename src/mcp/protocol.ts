import type { Scope } from '@shared/domain/derive';
import type { Workspace } from '@shared/types';

import {
  briefing,
  contactDetail,
  findContact,
  findProject,
  projectDetail,
  search,
  workspaceInfo,
} from './tools';

/**
 * The Model Context Protocol, by hand (D39).
 *
 * Only three methods matter for a tools-only server — `initialize`,
 * `tools/list`, `tools/call` — over newline-delimited JSON-RPC 2.0 on stdio.
 * The official SDK does the same thing, but arrives with express, cors, jose
 * and an OAuth stack to support transports this server does not have; ~150
 * lines is a better trade than forty packages in the lockfile of an app whose
 * whole pitch is that it has no server.
 *
 * Everything here is a pure function of the request, so the protocol is
 * testable by feeding it objects — no pipes, no child process.
 */

/** The spec revision this server implements. */
export const PROTOCOL_VERSION = '2025-06-18';

export interface JsonRpcRequest {
  jsonrpc: '2.0';
  id?: string | number | null;
  method: string;
  params?: Record<string, unknown>;
}

export interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: string | number | null;
  result?: unknown;
  error?: { code: number; message: string };
}

/** JSON-RPC reserved codes; the only ones a tools server needs. */
const METHOD_NOT_FOUND = -32601;
const INVALID_PARAMS = -32602;
const INTERNAL_ERROR = -32603;

const STRING = { type: 'string' } as const;

/** The tool catalogue, as JSON Schema for the client's tool list. */
export const TOOLS = [
  {
    name: 'ariadne_briefing',
    description:
      'What needs attention right now: overdue tasks, due today, due this week, and blocked ' +
      'tasks, with counts and remaining effort. Use this to answer "what should I work on" ' +
      'or to write a stand-up note.',
    inputSchema: {
      type: 'object',
      properties: {
        scope: {
          type: 'string',
          enum: ['all', 'work', 'home'],
          description: 'Limit to work or personal projects. Defaults to all.',
        },
      },
    },
  },
  {
    name: 'ariadne_search',
    description:
      'Search tasks, projects, contacts and tags at once. Use this first to turn a vague ' +
      'reference ("the varnish thing", "Dana") into real records with ids.',
    inputSchema: {
      type: 'object',
      properties: { query: { ...STRING, description: 'Free text.' } },
      required: ['query'],
    },
  },
  {
    name: 'ariadne_project',
    description:
      'Everything about one project: its tasks with status and due dates, effort remaining, ' +
      'dependencies between tasks, the people involved, notes, links and files.',
    inputSchema: {
      type: 'object',
      properties: { project: { ...STRING, description: 'Project name or id.' } },
      required: ['project'],
    },
  },
  {
    name: 'ariadne_contact',
    description:
      'Everything about one person: how to reach them, who they report to and who reports to ' +
      'them, which projects they touch, and every task of theirs. Use this for "what have I ' +
      'asked X for".',
    inputSchema: {
      type: 'object',
      properties: { contact: { ...STRING, description: 'Contact name, email or id.' } },
      required: ['contact'],
    },
  },
  {
    name: 'ariadne_workspace_info',
    description:
      'Where the workspace is, how much is in it, and the list of projects. Useful to confirm ' +
      'the connection and to see project names before asking about one.',
    inputSchema: { type: 'object', properties: {} },
  },
] as const;

export interface ToolContext {
  /** Read fresh per call: the app flushes to disk shortly after every edit. */
  readWorkspace: () => Workspace;
  today: () => string;
  dataDir: string;
  locatedVia: string;
}

function text(value: unknown): unknown {
  return { content: [{ type: 'text', text: JSON.stringify(value, null, 2) }] };
}

function failure(message: string): unknown {
  // A tool-level failure, not a protocol one: the model should see it and
  // adjust, rather than the client treating the call as broken.
  return { content: [{ type: 'text', text: message }], isError: true };
}

function stringArg(params: Record<string, unknown> | undefined, key: string): string | null {
  const value = params?.[key];
  return typeof value === 'string' && value.trim() !== '' ? value : null;
}

/** Runs one tool. Errors become tool failures, never thrown protocol errors. */
export function callTool(
  name: string,
  args: Record<string, unknown> | undefined,
  ctx: ToolContext,
): unknown {
  const ws = ctx.readWorkspace();
  const today = ctx.today();

  switch (name) {
    case 'ariadne_briefing': {
      const raw = args?.scope;
      const scope: Scope = raw === 'work' || raw === 'home' ? raw : 'all';
      return text(briefing(ws, today, scope));
    }
    case 'ariadne_search': {
      const query = stringArg(args, 'query');
      if (query === null) return failure('search needs a "query" string');
      return text(search(ws, query, today));
    }
    case 'ariadne_project': {
      const needle = stringArg(args, 'project');
      if (needle === null) return failure('project needs a "project" name or id');
      const project = findProject(ws, needle);
      if (project === undefined) {
        const names = ws.projects.map((p) => p.name).join(', ');
        return failure(`No project matching “${needle}”. Projects are: ${names}`);
      }
      return text(projectDetail(ws, project, today));
    }
    case 'ariadne_contact': {
      const needle = stringArg(args, 'contact');
      if (needle === null) return failure('contact needs a "contact" name or id');
      const contact = findContact(ws, needle);
      if (contact === undefined) return failure(`No contact matching “${needle}”.`);
      return text(contactDetail(ws, contact, today));
    }
    case 'ariadne_workspace_info':
      return text(workspaceInfo(ws, today, ctx.dataDir, ctx.locatedVia));
    default:
      return failure(`Unknown tool: ${name}`);
  }
}

/**
 * Handles one JSON-RPC message. Returns null for notifications, which by
 * definition get no reply — answering one is a protocol violation that some
 * clients report as an error.
 */
export function handleRequest(request: JsonRpcRequest, ctx: ToolContext): JsonRpcResponse | null {
  const id = request.id ?? null;
  const reply = (result: unknown): JsonRpcResponse => ({ jsonrpc: '2.0', id, result });
  const fail = (code: number, message: string): JsonRpcResponse => ({
    jsonrpc: '2.0',
    id,
    error: { code, message },
  });

  if (request.method.startsWith('notifications/')) return null;

  switch (request.method) {
    case 'initialize': {
      // Echo the client's version when we speak it, so a newer client is not
      // forced down to ours; otherwise state what we do speak.
      const asked = request.params?.protocolVersion;
      const version = asked === PROTOCOL_VERSION ? asked : PROTOCOL_VERSION;
      return reply({
        protocolVersion: version,
        capabilities: { tools: {} },
        serverInfo: { name: 'ariadne', version: '1.0.0' },
        instructions:
          'Read-only access to a local Ariadne workspace: projects, tasks and contacts. ' +
          'Nothing here can change the data.',
      });
    }
    case 'ping':
      return reply({});
    case 'tools/list':
      return reply({ tools: TOOLS });
    case 'tools/call': {
      const name = request.params?.name;
      if (typeof name !== 'string') return fail(INVALID_PARAMS, 'tools/call needs a tool name');
      const args = request.params?.arguments;
      try {
        return reply(
          callTool(
            name,
            typeof args === 'object' && args !== null
              ? (args as Record<string, unknown>)
              : undefined,
            ctx,
          ),
        );
      } catch (err) {
        return fail(INTERNAL_ERROR, err instanceof Error ? err.message : 'tool failed');
      }
    }
    default:
      return fail(METHOD_NOT_FOUND, `Unsupported method: ${request.method}`);
  }
}

/** Parses one line and answers it; malformed JSON gets a parse error. */
export function handleLine(line: string, ctx: ToolContext): JsonRpcResponse | null {
  let request: JsonRpcRequest;
  try {
    request = JSON.parse(line) as JsonRpcRequest;
  } catch {
    return { jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } };
  }
  if (typeof request.method !== 'string') {
    return {
      jsonrpc: '2.0',
      id: request.id ?? null,
      error: { code: -32600, message: 'Invalid Request' },
    };
  }
  return handleRequest(request, ctx);
}
