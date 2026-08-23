import { seedWorkspace } from '@shared/domain/seed';
import { describe, expect, it } from 'vitest';

import { handleLine, handleRequest, PROTOCOL_VERSION, TOOLS } from './protocol';
import type { ToolContext } from './protocol';

const TODAY = '2026-07-08';

const ctx: ToolContext = {
  readWorkspace: () => seedWorkspace(TODAY),
  today: () => TODAY,
  dataDir: '/tmp/data',
  locatedVia: 'env',
};

function call(method: string, params?: Record<string, unknown>, id: number | null = 1) {
  return handleRequest({ jsonrpc: '2.0', id, method, params }, ctx);
}

/** The JSON a tool call put in its single text block. */
function payload(response: ReturnType<typeof call>): unknown {
  const result = response?.result as { content: { text: string }[]; isError?: boolean };
  return JSON.parse(result.content[0]?.text ?? '{}');
}

describe('handshake', () => {
  it('answers initialize with a protocol version and its tool capability', () => {
    const res = call('initialize', { protocolVersion: PROTOCOL_VERSION });
    expect(res?.result).toMatchObject({
      protocolVersion: PROTOCOL_VERSION,
      capabilities: { tools: {} },
      serverInfo: { name: 'ariadne' },
    });
  });

  it('states the version it speaks when the client asks for another', () => {
    const res = call('initialize', { protocolVersion: '2024-01-01' });
    expect((res?.result as { protocolVersion: string }).protocolVersion).toBe(PROTOCOL_VERSION);
  });

  it('never replies to a notification', () => {
    // Answering one is a protocol violation; some clients report it as an error.
    expect(call('notifications/initialized', {}, null)).toBeNull();
    expect(call('notifications/cancelled')).toBeNull();
  });

  it('answers ping, which clients use as a keepalive', () => {
    expect(call('ping')?.result).toEqual({});
  });

  it('refuses a method it does not implement', () => {
    expect(call('resources/list')?.error?.code).toBe(-32601);
  });
});

describe('tools/list', () => {
  it('advertises the read-only tool set', () => {
    const tools = (call('tools/list')?.result as { tools: { name: string }[] }).tools;
    expect(tools.map((t) => t.name)).toEqual([
      'ariadne_briefing',
      'ariadne_search',
      'ariadne_project',
      'ariadne_contact',
      'ariadne_workspace_info',
    ]);
  });

  it('gives every tool a description and a schema, which is all the model gets', () => {
    for (const tool of TOOLS) {
      expect(tool.description.length).toBeGreaterThan(40);
      expect(tool.inputSchema.type).toBe('object');
    }
  });

  it('marks the arguments a tool cannot work without', () => {
    const schemas = Object.fromEntries(TOOLS.map((t) => [t.name, t.inputSchema]));
    const search = schemas.ariadne_search as { required?: readonly string[] };
    expect(search.required).toEqual(['query']);
    // The briefing takes an optional scope and nothing else.
    expect((schemas.ariadne_briefing as { required?: readonly string[] }).required).toBeUndefined();
  });
});

describe('tools/call', () => {
  it('runs a tool and returns its JSON in a text block', () => {
    const res = call('tools/call', { name: 'ariadne_briefing', arguments: {} });
    expect(payload(res)).toMatchObject({ counts: { overdue: 3 } });
  });

  it('passes arguments through', () => {
    const res = call('tools/call', {
      name: 'ariadne_project',
      arguments: { project: 'Refinish boat table' },
    });
    expect(payload(res)).toMatchObject({ name: 'Refinish boat table' });
  });

  it('reports a bad lookup as a tool error the model can act on', () => {
    const res = call('tools/call', { name: 'ariadne_project', arguments: { project: 'nope' } });
    const result = res?.result as { isError?: boolean; content: { text: string }[] };
    expect(result.isError).toBe(true);
    // Naming the real projects turns a dead end into a next step.
    expect(result.content[0]?.text).toContain('Q3 Platform Migration');
  });

  it('reports a missing argument without failing the call', () => {
    const res = call('tools/call', { name: 'ariadne_search', arguments: {} });
    expect((res?.result as { isError?: boolean }).isError).toBe(true);
  });

  it('reports an unknown tool as a tool error, not a protocol error', () => {
    const res = call('tools/call', { name: 'ariadne_delete_everything', arguments: {} });
    expect(res?.error).toBeUndefined();
    expect((res?.result as { isError?: boolean }).isError).toBe(true);
  });

  it('rejects a call with no tool name at the protocol level', () => {
    expect(call('tools/call', { arguments: {} })?.error?.code).toBe(-32602);
  });

  it('turns a thrown error into a protocol error rather than dying', () => {
    const broken: ToolContext = {
      ...ctx,
      readWorkspace: () => {
        throw new Error('disk went away');
      },
    };
    const res = handleRequest(
      { jsonrpc: '2.0', id: 9, method: 'tools/call', params: { name: 'ariadne_briefing' } },
      broken,
    );
    expect(res?.error?.message).toBe('disk went away');
  });

  it('re-reads the workspace on every call, so answers are never stale', () => {
    let reads = 0;
    const counting: ToolContext = {
      ...ctx,
      readWorkspace: () => {
        reads += 1;
        return seedWorkspace(TODAY);
      },
    };
    for (let i = 0; i < 3; i++) {
      handleRequest(
        { jsonrpc: '2.0', id: i, method: 'tools/call', params: { name: 'ariadne_briefing' } },
        counting,
      );
    }
    expect(reads).toBe(3);
  });
});

describe('handleLine', () => {
  it('parses and answers a line', () => {
    const res = handleLine('{"jsonrpc":"2.0","id":1,"method":"ping"}', ctx);
    expect(res).toEqual({ jsonrpc: '2.0', id: 1, result: {} });
  });

  it('returns a parse error for a line that is not JSON', () => {
    expect(handleLine('not json', ctx)?.error?.code).toBe(-32700);
  });

  it('returns an invalid-request error for JSON with no method', () => {
    expect(handleLine('{"jsonrpc":"2.0","id":3}', ctx)?.error?.code).toBe(-32600);
  });
});

describe('read-only guarantee', () => {
  it('exposes no tool that could change anything', () => {
    // The contract the skill and the D39 row both promise.
    for (const tool of TOOLS) {
      expect(tool.name).not.toMatch(/create|add|update|delete|set|remove|write/i);
    }
  });
});
