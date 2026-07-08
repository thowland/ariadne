import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { BlobService } from './blob-service';

let dir: string;
let svc: BlobService;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'ariadne-blob-'));
  svc = new BlobService(dir);
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

const bytes = (s: string): Uint8Array => new TextEncoder().encode(s);

describe('BlobService', () => {
  it('saves and finds blobs by id with extension', async () => {
    const result = await svc.save('abc-123', 'pdf', bytes('%PDF-fake'));
    expect(result.size).toBe(9);
    const path = svc.find('abc-123');
    expect(path).toBe(join(dir, 'blobs', 'abc-123.pdf'));
    expect(readFileSync(path!, 'utf8')).toBe('%PDF-fake');
  });

  it('replaces previous bytes for the same id (re-upload, new ext)', async () => {
    await svc.save('id1', 'png', bytes('old'));
    await svc.save('id1', 'jpg', bytes('newer'));
    expect(readdirSync(join(dir, 'blobs'))).toEqual(['id1.jpg']);
  });

  it('sanitizes suspicious extensions to none', async () => {
    await svc.save('id2', '../evil', bytes('x'));
    expect(svc.find('id2')).toBe(join(dir, 'blobs', 'id2'));
  });

  it('rejects path-like ids on save and find', async () => {
    await expect(svc.save('../escape', 'txt', bytes('x'))).rejects.toThrow(/invalid blob id/);
    expect(svc.find('../escape')).toBeNull();
  });

  it('find returns null for unknown ids or before any save', () => {
    expect(svc.find('nope')).toBeNull();
  });

  it('does not match ids by prefix collision', async () => {
    await svc.save('abc-1234', 'txt', bytes('long'));
    expect(svc.find('abc-123')).toBeNull();
  });

  it('deletes blobs individually and in bulk', async () => {
    await svc.save('a', 'txt', bytes('a'));
    await svc.save('b', 'txt', bytes('b'));
    await svc.delete('a');
    expect(svc.find('a')).toBeNull();
    expect(svc.find('b')).not.toBeNull();

    await svc.deleteMany(['b', 'missing']);
    expect(svc.find('b')).toBeNull();
    expect(existsSync(join(dir, 'blobs'))).toBe(true);
  });
});
