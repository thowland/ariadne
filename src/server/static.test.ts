import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { createStaticHandler } from './static';

function fakeRes(): ServerResponse & {
  status: number;
  headers: Record<string, unknown>;
  body: string;
} {
  const out = {
    status: 0,
    headers: {} as Record<string, unknown>,
    body: '',
    writeHead(status: number, headers: Record<string, unknown> = {}) {
      out.status = status;
      out.headers = headers;
      return out;
    },
    end(body?: string | Buffer) {
      out.body = body === undefined ? '' : body.toString();
    },
  };
  return out as never;
}

async function get(
  handler: ReturnType<typeof createStaticHandler>,
  url: string,
  method = 'GET',
): Promise<ReturnType<typeof fakeRes>> {
  const res = fakeRes();
  await handler({ url, method } as IncomingMessage, res);
  return res;
}

describe('createStaticHandler', () => {
  const root = mkdtempSync(join(tmpdir(), 'ariadne-web-'));
  mkdirSync(join(root, 'assets'));
  writeFileSync(join(root, 'index.html'), '<html>app</html>');
  writeFileSync(join(root, 'assets', 'app-1a2b.js'), 'console.log(1)');
  writeFileSync(join(tmpdir(), 'ariadne-secret.txt'), 'secret');
  const handler = createStaticHandler(root);

  it('serves files, caching hashed assets for good and the page never', async () => {
    const page = await get(handler, '/');
    expect(page.body).toBe('<html>app</html>');
    expect(page.headers['Cache-Control']).toBe('no-cache');
    expect(page.headers['X-Frame-Options']).toBe('DENY');

    const js = await get(handler, '/assets/app-1a2b.js');
    expect(js.headers['Content-Type']).toBe('text/javascript; charset=utf-8');
    expect(js.headers['Cache-Control']).toContain('immutable');
  });

  it('falls back to the app for unknown paths', async () => {
    expect((await get(handler, '/projects/p1')).body).toBe('<html>app</html>');
  });

  it('never serves anything outside its folder', async () => {
    const res = await get(handler, '/..%2fariadne-secret.txt');
    expect(res.body).toBe('<html>app</html>');
    expect((await get(handler, '/%E0%A4%A')).status).toBe(400);
  });

  it('answers HEAD like GET', async () => {
    expect((await get(handler, '/', 'HEAD')).status).toBe(200);
  });

  it('only answers reads, and says so when there is no build', async () => {
    expect((await get(handler, '/', 'POST')).status).toBe(405);
    const empty = createStaticHandler(mkdtempSync(join(tmpdir(), 'ariadne-empty-')));
    const res = await get(empty, '/');
    expect(res.status).toBe(404);
    expect(res.body).toContain('npm run web:build');
  });
});
