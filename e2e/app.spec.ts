import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { _electron as electron, expect, test } from '@playwright/test';

// Placeholder smoke test proving the Playwright/Electron wiring. Becomes a
// required sprint gate (with real flows) from Sprint 2.
test('app launches and renders the shell', async () => {
  const app = await electron.launch({
    args: ['out/main/index.js'],
    env: {
      ...process.env,
      // Isolate Electron's own state (window bounds cache etc.) per run.
      ARIADNE_TEST_USER_DATA: mkdtempSync(join(tmpdir(), 'ariadne-e2e-')),
      ARIADNE_FAKE_TODAY: '2026-07-08',
    },
  });

  const win = await app.firstWindow();
  await expect(win.getByRole('heading', { name: 'Ariadne' })).toBeVisible();
  await expect(win).toHaveTitle('Ariadne');

  await app.close();
});
