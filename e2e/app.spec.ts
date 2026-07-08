import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { ElectronApplication } from '@playwright/test';
import { _electron as electron, expect, test } from '@playwright/test';

const FAKE_TODAY = '2026-07-08';

function launch(userDataDir: string): Promise<ElectronApplication> {
  return electron.launch({
    args: ['out/main/index.js'],
    env: {
      ...process.env,
      ARIADNE_TEST_USER_DATA: userDataDir,
      ARIADNE_FAKE_TODAY: FAKE_TODAY,
    },
  });
}

test('first run seeds the sample workspace', async () => {
  const userData = mkdtempSync(join(tmpdir(), 'ariadne-e2e-'));
  const app = await launch(userData);
  const win = await app.firstWindow();

  await expect(win.getByRole('heading', { name: 'Ariadne' })).toBeVisible();
  await expect(win).toHaveTitle('Ariadne');
  await expect(win.getByTestId('workspace-summary')).toHaveText('6 projects · 30 tasks · 5 files');

  await app.close();
});

test('mutations survive an app restart (persistence round trip)', async () => {
  const userData = mkdtempSync(join(tmpdir(), 'ariadne-e2e-'));

  const first = await launch(userData);
  let win = await first.firstWindow();
  await expect(win.getByTestId('workspace-summary')).toHaveText('6 projects · 30 tasks · 5 files');
  await win.getByRole('button', { name: 'Add debug task' }).click();
  await expect(win.getByTestId('workspace-summary')).toContainText('31 tasks');
  // Give the main-process debounce (300ms) time to hit disk before quitting;
  // the before-quit flush also covers this, so both paths get exercised.
  await first.close();

  const second = await launch(userData);
  win = await second.firstWindow();
  await expect(win.getByTestId('workspace-summary')).toHaveText('6 projects · 31 tasks · 5 files');
  await second.close();
});
