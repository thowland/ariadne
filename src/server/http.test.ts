import type { IncomingMessage, ServerResponse } from 'node:http';
import { Readable } from 'node:stream';

import { describe, expect, it } from 'vitest';

import {
  attachment,
  contentTypeFor,
  HttpError,
  isAllowedHost,
  readBody,
  readJson,
  sendBytes,
  sendJson,
} from './http';

function req(chunks: (string | Buffer)[]): IncomingMessage {
  return Readable.from(chunks) as unknown as IncomingMessage;
}

function res(): ServerResponse & {
  status: number;
  headers: Record<string, unknown>;
  body: string;
} {
  const out = {
    status: 0,
    headers: {} as Record<string, unknown>,
    body: '',
    writeHead(status: number, headers: Record<string, unknown>) {
      out.status = status;
      out.headers = headers;
      return out;
    },
    end(body?: string | Buffer) {
      out.body = body === undefined ? '' : body.toString();
    },
  };
  return out as unknown as ServerResponse & {
    status: number;
    headers: Record<string, unknown>;
    body: string;
  };
}

describe('readBody / readJson', () => {
  it('collects the body and parses JSON', async () => {
    expect((await readBody(req(['ab', Buffer.from('c')]), 10)).toString()).toBe('abc');
    expect(await readJson(req(['{"a":', '1}']), 100)).toEqual({ a: 1 });
    expect(await readJson(req([]), 100)).toBeNull();
  });

  it('refuses a body over the limit, and one that is not JSON', async () => {
    await expect(readBody(req(['12345', '6']), 5)).rejects.toMatchObject({ status: 413 });
    await expect(readJson(req(['{nope']), 100)).rejects.toBeInstanceOf(HttpError);
  });
});

describe('responses', () => {
  it('sends JSON and bytes uncached', () => {
    const r = res();
    sendJson(r, 201, { ok: true });
    expect(r.status).toBe(201);
    expect(r.body).toBe('{"ok":true}');
    expect(r.headers['Cache-Control']).toBe('no-store');

    const b = res();
    sendBytes(b, Buffer.from('hi'), 'text/plain', { 'X-Extra': '1' });
    expect(b.headers).toMatchObject({ 'Content-Length': 2, 'X-Extra': '1' });
    expect(b.body).toBe('hi');
  });

  it('names downloads safely, keeping the real name for browsers that read it', () => {
    expect(attachment('Plan "Q3".pdf')).toBe(
      `attachment; filename="Plan _Q3_.pdf"; filename*=UTF-8''Plan%20%22Q3%22.pdf`,
    );
    expect(attachment('Café.md')).toContain(`filename="Caf_.md"`);
  });

  it('types files by extension', () => {
    expect(contentTypeFor('/x/index.html')).toBe('text/html; charset=utf-8');
    expect(contentTypeFor('a/B.PDF')).toBe('application/pdf');
    expect(contentTypeFor('noext')).toBe('application/octet-stream');
  });
});

describe('isAllowedHost', () => {
  const allowed = ['127.0.0.1', '::1', 'localhost'];
  it('accepts loopback names with or without a port', () => {
    expect(isAllowedHost('localhost:4318', allowed)).toBe(true);
    expect(isAllowedHost('LOCALHOST', allowed)).toBe(true);
    expect(isAllowedHost('[::1]:4318', allowed)).toBe(true);
  });
  it('refuses other names, which is what stops DNS rebinding', () => {
    expect(isAllowedHost('evil.example:4318', allowed)).toBe(false);
    expect(isAllowedHost(undefined, allowed)).toBe(false);
  });
});
