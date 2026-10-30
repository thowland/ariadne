import { afterEach, describe, expect, it, vi } from 'vitest';

describe('install-web-api (D55)', () => {
  afterEach(() => {
    vi.resetModules();
  });

  it('installs the HTTP client when no preload has set window.ariadne', async () => {
    delete (window as { ariadne?: unknown }).ariadne;
    await import('./install-web-api');
    expect(window.ariadne.blobBaseUrl).toBe('/api/blob/');
  });

  it('leaves the desktop preload’s API alone', async () => {
    const preload = { fakeToday: null } as unknown as Window['ariadne'];
    window.ariadne = preload;
    await import('./install-web-api');
    expect(window.ariadne).toBe(preload);
  });
});
