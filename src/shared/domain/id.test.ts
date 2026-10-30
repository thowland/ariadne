import { describe, expect, it } from 'vitest';

import { newId, uuidFromRandomBytes } from './id';

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('newId', () => {
  it('produces UUID-shaped ids', () => {
    expect(newId()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });

  it('produces unique ids', () => {
    const ids = new Set(Array.from({ length: 1000 }, () => newId()));
    expect(ids.size).toBe(1000);
  });

  it('works on a plain-HTTP page, where browsers leave out randomUUID (D55)', () => {
    const insecure = { getRandomValues: crypto.getRandomValues.bind(crypto) };
    const ids = Array.from({ length: 1000 }, () => newId(insecure));
    expect(ids.every((id) => UUID_V4.test(id))).toBe(true);
    expect(new Set(ids).size).toBe(1000);
  });

  it('uses randomUUID when the page has it', () => {
    expect(newId({ randomUUID: () => 'from-randomUUID', getRandomValues: (a) => a })).toBe(
      'from-randomUUID',
    );
  });
});

describe('uuidFromRandomBytes', () => {
  it('sets the version and variant bits on any bytes', () => {
    const fill = (v: number) => ({ getRandomValues: <T extends Uint8Array>(a: T) => a.fill(v) });
    expect(uuidFromRandomBytes(fill(0x00))).toBe('00000000-0000-4000-8000-000000000000');
    expect(uuidFromRandomBytes(fill(0xff))).toBe('ffffffff-ffff-4fff-bfff-ffffffffffff');
  });
});
