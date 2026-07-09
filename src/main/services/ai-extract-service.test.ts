import { describe, expect, it, vi } from 'vitest';

import { AI_MODEL, AiExtractService } from './ai-extract-service';

/**
 * The service is exercised through the real Anthropic SDK with an injected
 * fetch, so status→error mapping and request shaping run the production path.
 */

const TODAY = '2026-07-08';
const KEY = 'sk-ant-test';

function messageResponse(payload: unknown, stopReason = 'end_turn'): Response {
  return jsonResponse(200, {
    id: 'msg_1',
    type: 'message',
    role: 'assistant',
    model: AI_MODEL,
    content: [{ type: 'text', text: JSON.stringify(payload) }],
    stop_reason: stopReason,
    stop_sequence: null,
    usage: { input_tokens: 10, output_tokens: 10 },
  });
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function serviceWith(
  impl: (url: string, init: RequestInit | undefined) => Response | Promise<Response>,
): { service: AiExtractService; calls: { url: string; init: RequestInit | undefined }[] } {
  const calls: { url: string; init: RequestInit | undefined }[] = [];
  const fetchImpl = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    calls.push({ url, init });
    return impl(url, init);
  });
  return {
    service: new AiExtractService({ fetch: fetchImpl, maxRetries: 0 }),
    calls,
  };
}

const GOOD_TASK = {
  title: 'Ship the report',
  notes: '',
  dueDate: '2026-07-10',
  priority: 'High',
  projectHint: 'Alpha',
};

describe('AiExtractService', () => {
  it('rejects a missing key or empty text without calling the API', async () => {
    const { service, calls } = serviceWith(() => messageResponse({ tasks: [] }));
    expect(await service.extractTasks('', 'text', [], TODAY)).toEqual({
      ok: false,
      error: 'Add your Anthropic API key in Settings first',
    });
    expect(await service.extractTasks(KEY, '   ', [], TODAY)).toEqual({
      ok: false,
      error: 'Paste some text to extract tasks from',
    });
    expect(await service.extractTasks(KEY, 'x'.repeat(100_001), [], TODAY)).toMatchObject({
      ok: false,
    });
    expect(calls).toHaveLength(0);
  });

  it('sends a structured-output request and returns validated tasks', async () => {
    const { service, calls } = serviceWith(() => messageResponse({ tasks: [GOOD_TASK] }));
    const result = await service.extractTasks(KEY, 'Notes: ship the report', ['Alpha'], TODAY);
    expect(result).toEqual({ ok: true, tasks: [GOOD_TASK] });

    expect(calls).toHaveLength(1);
    const call = calls[0];
    expect(call?.url).toContain('/v1/messages');
    expect(new Headers(call?.init?.headers).get('x-api-key')).toBe(KEY);
    expect(typeof call?.init?.body).toBe('string');
    const body = JSON.parse(call?.init?.body as string) as {
      model: string;
      system: string;
      output_config: { format: { type: string; schema: { required: string[] } } };
      messages: { role: string; content: string }[];
    };
    expect(body.model).toBe(AI_MODEL);
    expect(body.output_config.format.type).toBe('json_schema');
    expect(body.output_config.format.schema.required).toEqual(['tasks']);
    expect(body.system).toContain(TODAY);
    expect(body.system).toContain('"Alpha"');
    expect(body.messages).toEqual([{ role: 'user', content: 'Notes: ship the report' }]);
  });

  it('maps auth, rate-limit, and server errors to friendly messages', async () => {
    const cases: [number, RegExp][] = [
      [401, /rejected the API key/],
      [403, /not allowed to use the model/],
      [429, /rate limit/],
      [500, /HTTP 500/],
    ];
    for (const [status, expected] of cases) {
      const { service } = serviceWith(() =>
        jsonResponse(status, { type: 'error', error: { type: 'api_error', message: 'nope' } }),
      );
      const result = await service.extractTasks(KEY, 'text', [], TODAY);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toMatch(expected);
    }
  });

  it('reports connection failures as unreachable', async () => {
    const { service } = serviceWith(() => {
      throw new TypeError('fetch failed');
    });
    expect(await service.extractTasks(KEY, 'text', [], TODAY)).toEqual({
      ok: false,
      error: 'Could not reach Anthropic — check your connection',
    });
  });

  it('surfaces refusal and truncation stop reasons', async () => {
    const refused = serviceWith(() => messageResponse({ tasks: [] }, 'refusal'));
    expect(await refused.service.extractTasks(KEY, 'text', [], TODAY)).toEqual({
      ok: false,
      error: 'Claude declined to process this text',
    });
    const truncated = serviceWith(() => messageResponse({ tasks: [] }, 'max_tokens'));
    expect(await truncated.service.extractTasks(KEY, 'text', [], TODAY)).toMatchObject({
      ok: false,
      error: expect.stringContaining('cut short') as string,
    });
  });

  it('rejects unparseable or mis-shaped model output', async () => {
    const notJson = serviceWith(() =>
      jsonResponse(200, {
        id: 'msg_1',
        type: 'message',
        role: 'assistant',
        model: AI_MODEL,
        content: [{ type: 'text', text: 'not json' }],
        stop_reason: 'end_turn',
        stop_sequence: null,
        usage: { input_tokens: 1, output_tokens: 1 },
      }),
    );
    expect(await notJson.service.extractTasks(KEY, 'text', [], TODAY)).toMatchObject({
      ok: false,
      error: expect.stringContaining('unreadable') as string,
    });

    const wrongShape = serviceWith(() => messageResponse({ items: [] }));
    expect(await wrongShape.service.extractTasks(KEY, 'text', [], TODAY)).toMatchObject({
      ok: false,
      error: expect.stringContaining('unexpected') as string,
    });
  });
});
