import Anthropic from '@anthropic-ai/sdk';
import type { ExtractedTask } from '@shared/domain/ai-import';
import { parseExtraction } from '@shared/domain/ai-import';
import type { AiExtractResponse } from '@shared/ipc-contract';
import { TASK_PRIORITIES } from '@shared/types';

/**
 * Sends pasted text to Claude and extracts task candidates (spec D12).
 * Runs in the main process (keeps the API key out of the renderer, no CORS).
 * Structured outputs pin the response to EXTRACTION_SCHEMA; the shared
 * parseExtraction() re-validates defensively on the way back.
 */

export const AI_MODEL = 'claude-sonnet-5';
const MAX_INPUT_CHARS = 100_000;

const EXTRACTION_SCHEMA = {
  type: 'object',
  properties: {
    tasks: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Short imperative task title' },
          notes: {
            type: 'string',
            description: 'Supporting context copied or summarized from the text; empty if none',
          },
          dueDate: {
            anyOf: [{ type: 'string' }, { type: 'null' }],
            description:
              'Due date as YYYY-MM-DD, resolving relative dates against today; null when the text gives none',
          },
          priority: { type: 'string', enum: [...TASK_PRIORITIES] },
          projectHint: {
            anyOf: [{ type: 'string' }, { type: 'null' }],
            description:
              'The existing project name this task clearly belongs to, exactly as listed; null when unsure',
          },
        },
        required: ['title', 'notes', 'dueDate', 'priority', 'projectHint'],
        additionalProperties: false,
      },
    },
  },
  required: ['tasks'],
  additionalProperties: false,
};

function systemPrompt(today: string, projectNames: readonly string[]): string {
  const projects =
    projectNames.length > 0
      ? `Existing projects: ${projectNames.map((n) => JSON.stringify(n)).join(', ')}.`
      : 'There are no existing projects.';
  return [
    'You extract actionable tasks from freeform text (meeting notes, emails, brain dumps)',
    'for a personal task tracker. Extract each distinct action item as one task with a short',
    'imperative title. Only include genuine action items — skip statements, decisions already',
    'made, and questions with no follow-up.',
    `Today is ${today}. Resolve relative dates ("Friday", "next week", "end of month") to`,
    'YYYY-MM-DD due dates; use null when the text implies no date.',
    'Priority: Critical = explicit urgency or hard deadline risk, High = important/asap,',
    'Medium = default, Low = someday/nice-to-have.',
    projects,
    'Set projectHint to the matching project name exactly as listed only when the task',
    'clearly belongs there; otherwise null.',
  ].join(' ');
}

interface ClientOptions {
  fetch?: typeof fetch;
  maxRetries?: number;
}

export class AiExtractService {
  constructor(private readonly clientOptions: ClientOptions = {}) {}

  async extractTasks(
    apiKey: string,
    text: string,
    projectNames: readonly string[],
    today: string,
  ): Promise<AiExtractResponse> {
    if (apiKey.trim() === '') {
      return { ok: false, error: 'Add your Anthropic API key in Settings first' };
    }
    const body = text.trim();
    if (body === '') return { ok: false, error: 'Paste some text to extract tasks from' };
    if (body.length > MAX_INPUT_CHARS) {
      return { ok: false, error: 'That text is too long — paste a smaller chunk' };
    }

    const client = new Anthropic({ apiKey: apiKey.trim(), ...this.clientOptions });
    let response;
    try {
      response = await client.messages.create({
        model: AI_MODEL,
        max_tokens: 16000,
        system: systemPrompt(today, projectNames),
        output_config: { format: { type: 'json_schema', schema: EXTRACTION_SCHEMA } },
        messages: [{ role: 'user', content: body }],
      });
    } catch (err) {
      return { ok: false, error: this.errorMessage(err) };
    }

    if (response.stop_reason === 'refusal') {
      return { ok: false, error: 'Claude declined to process this text' };
    }
    if (response.stop_reason === 'max_tokens') {
      return { ok: false, error: 'Response was cut short — try a smaller chunk of text' };
    }

    const textBlock = response.content.find((b) => b.type === 'text');
    if (textBlock === undefined) {
      return { ok: false, error: 'Claude returned an empty response — try again' };
    }
    let raw: unknown;
    try {
      raw = JSON.parse(textBlock.text);
    } catch {
      return { ok: false, error: 'Claude returned an unreadable response — try again' };
    }
    const tasks: ExtractedTask[] | null = parseExtraction(raw);
    if (tasks === null) {
      return { ok: false, error: 'Claude returned an unexpected response — try again' };
    }
    return { ok: true, tasks };
  }

  private errorMessage(err: unknown): string {
    if (err instanceof Anthropic.AuthenticationError) {
      return 'Anthropic rejected the API key — check it in Settings';
    }
    if (err instanceof Anthropic.PermissionDeniedError) {
      return 'This API key is not allowed to use the model — check your Anthropic plan';
    }
    if (err instanceof Anthropic.RateLimitError) {
      return 'Anthropic rate limit hit — try again in a minute';
    }
    if (err instanceof Anthropic.APIConnectionError) {
      return 'Could not reach Anthropic — check your connection';
    }
    if (err instanceof Anthropic.APIError) {
      return `Anthropic error (HTTP ${String(err.status ?? '?')}) — try again in a minute`;
    }
    return 'AI extraction failed — try again';
  }
}
