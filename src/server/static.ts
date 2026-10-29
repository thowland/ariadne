import { readFile, stat } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { join, normalize, sep } from 'node:path';

import { contentTypeFor, sendBytes } from './http';

/**
 * Serves the built web app (D55). A path that names no file falls back to
 * `index.html`, and nothing outside `root` can be reached: the request path
 * is normalized and must stay under it.
 */
export function createStaticHandler(
  root: string,
): (req: IncomingMessage, res: ServerResponse) => Promise<void> {
  const base = normalize(root.endsWith(sep) ? root : `${root}${sep}`);
  const headers = {
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'X-Frame-Options': 'DENY',
  };

  const fileAt = async (rel: string): Promise<string | null> => {
    const path = normalize(join(base, rel));
    if (!path.startsWith(base)) return null;
    try {
      return (await stat(path)).isFile() ? path : null;
    } catch {
      return null;
    }
  };

  return async (req, res) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405).end();
      return;
    }
    let rel: string;
    try {
      rel = decodeURIComponent(new URL(req.url ?? '/', 'http://localhost').pathname);
    } catch {
      res.writeHead(400).end();
      return;
    }
    const path = (await fileAt(rel)) ?? (await fileAt('index.html'));
    if (path === null) {
      res
        .writeHead(404, { 'Content-Type': 'text/plain' })
        .end('Web build not found — run npm run web:build');
      return;
    }
    // Hashed bundle assets never change; the page itself must always revalidate.
    const immutable = /[\\/]assets[\\/]/.test(path);
    sendBytes(res, await readFile(path), contentTypeFor(path), {
      ...headers,
      'Cache-Control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache',
    });
  };
}
