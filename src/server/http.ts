import type { IncomingMessage, ServerResponse } from 'node:http';

/**
 * The few HTTP helpers the web server needs, on Node's own `http` module so
 * the server bundle carries no framework (D55).
 */

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/** Reads a request body, refusing anything past `limit` bytes. */
export async function readBody(req: IncomingMessage, limit: number): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string);
    size += buf.byteLength;
    if (size > limit) throw new HttpError(413, 'Request too large');
    chunks.push(buf);
  }
  return Buffer.concat(chunks);
}

export async function readJson(req: IncomingMessage, limit: number): Promise<unknown> {
  const body = await readBody(req, limit);
  if (body.byteLength === 0) return null;
  try {
    return JSON.parse(body.toString('utf8')) as unknown;
  } catch {
    throw new HttpError(400, 'Request body is not JSON');
  }
}

export function sendJson(res: ServerResponse, status: number, value: unknown): void {
  const body = JSON.stringify(value ?? null);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

export function sendBytes(
  res: ServerResponse,
  bytes: Buffer,
  contentType: string,
  extra: Record<string, string> = {},
): void {
  res.writeHead(200, {
    'Content-Type': contentType,
    'Content-Length': bytes.byteLength,
    'Cache-Control': 'no-store',
    ...extra,
  });
  res.end(bytes);
}

/** `attachment` disposition with a safe ASCII fallback and the UTF-8 name. */
export function attachment(name: string): string {
  const ascii = name.replace(/[^\x20-\x7e]|["\\]/g, '_');
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}

const TYPES: Record<string, string> = {
  html: 'text/html; charset=utf-8',
  js: 'text/javascript; charset=utf-8',
  mjs: 'text/javascript; charset=utf-8',
  css: 'text/css; charset=utf-8',
  json: 'application/json; charset=utf-8',
  svg: 'image/svg+xml',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  ico: 'image/x-icon',
  woff: 'font/woff',
  woff2: 'font/woff2',
  pdf: 'application/pdf',
  csv: 'text/csv; charset=utf-8',
  md: 'text/markdown; charset=utf-8',
  txt: 'text/plain; charset=utf-8',
  zip: 'application/zip',
  map: 'application/json',
  wasm: 'application/wasm',
};

export function contentTypeFor(path: string): string {
  const ext = /\.([a-z0-9]+)$/i.exec(path)?.[1]?.toLowerCase() ?? '';
  return TYPES[ext] ?? 'application/octet-stream';
}

/**
 * Hosts a browser may legitimately use to reach a loopback server. Checking
 * the Host header defeats DNS rebinding, where a hostile domain is pointed
 * at 127.0.0.1 so its pages count as same-origin with this server.
 */
export function isAllowedHost(host: string | undefined, allowed: readonly string[]): boolean {
  if (host === undefined) return false;
  const name = host
    .replace(/:\d+$/, '')
    .replace(/^\[|\]$/g, '')
    .toLowerCase();
  return allowed.includes(name);
}
