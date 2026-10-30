import { describe, expect, it } from 'vitest';

import { WEB_ROUTES, webBlobPath } from './web-contract';

describe('web contract (D55)', () => {
  it('builds blob paths with the id encoded', () => {
    expect(webBlobPath('f1')).toBe('/api/blob/f1');
    expect(webBlobPath('../x')).toBe('/api/blob/..%2Fx');
  });

  it('keeps every route under /api/ and distinct', () => {
    const paths = Object.values(WEB_ROUTES);
    expect(paths.every((p) => p.startsWith('/api/'))).toBe(true);
    expect(new Set(paths).size).toBe(paths.length);
  });
});
