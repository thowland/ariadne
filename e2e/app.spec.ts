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

test('first run seeds the sample workspace into the Command Center', async () => {
  const userData = mkdtempSync(join(tmpdir(), 'ariadne-e2e-'));
  const app = await launch(userData);
  const win = await app.firstWindow();

  await expect(win).toHaveTitle('Ariadne');
  await expect(win.getByTestId('home-headline')).toHaveText('5 tasks need your attention today');
  await expect(win.getByTestId('ambient-banner')).toContainText('3 tasks overdue');
  // Sidebar lists all six seeded projects.
  const projectNav = win.getByRole('navigation', { name: 'Projects' });
  await expect(projectNav.getByRole('button', { name: /Q3 Platform Migration/ })).toBeVisible();
  await expect(projectNav.getByRole('button', { name: /Home network upgrade/ })).toBeVisible();
  // Portfolio column renders project cards.
  await expect(win.getByTestId('project-card-p1')).toBeVisible();

  await app.close();
});

test('scope filter and search work end-to-end', async () => {
  const userData = mkdtempSync(join(tmpdir(), 'ariadne-e2e-'));
  const app = await launch(userData);
  const win = await app.firstWindow();
  await expect(win.getByTestId('home-headline')).toBeVisible();

  // Scope → Home: work project cards disappear.
  await win.getByRole('tab', { name: 'Home' }).click();
  await expect(win.getByTestId('project-card-p3')).toBeVisible();
  await expect(win.getByTestId('project-card-p1')).toHaveCount(0);
  await win.getByRole('tab', { name: 'All' }).click();

  // Search finds seeded content; clearing restores the view.
  await win.getByPlaceholder('Search tasks & projects…').fill('varnish');
  await expect(win.getByTestId('search-summary')).toContainText('matching “varnish”');
  await expect(win.getByText('Apply first coat of spar varnish')).toBeVisible();
  await win.getByPlaceholder('Search tasks & projects…').fill('');
  await expect(win.getByTestId('home-headline')).toBeVisible();

  await app.close();
});

test('created projects survive an app restart (persistence round trip)', async () => {
  const userData = mkdtempSync(join(tmpdir(), 'ariadne-e2e-'));

  const first = await launch(userData);
  let win = await first.firstWindow();
  await expect(win.getByTestId('home-headline')).toBeVisible();
  await win.getByTitle('New project').click();
  await expect(win.getByLabel('Project name')).toHaveValue('Untitled project');
  await first.close();

  const second = await launch(userData);
  win = await second.firstWindow();
  await expect(
    win
      .getByRole('navigation', { name: 'Projects' })
      .getByRole('button', { name: /Untitled project/ }),
  ).toBeVisible();
  await second.close();
});

test('full task lifecycle: create project, add tasks, dependency, edit, restart', async () => {
  const userData = mkdtempSync(join(tmpdir(), 'ariadne-e2e-'));

  const first = await launch(userData);
  let win = await first.firstWindow();
  await expect(win.getByTestId('home-headline')).toBeVisible();

  // Create a project and rename it.
  await win.getByTitle('New project').click();
  const nameInput = win.getByLabel('Project name');
  await expect(nameInput).toHaveValue('Untitled project');
  await nameInput.fill('Garage workshop');

  // Quick-add two tasks.
  const quickAdd = win.getByPlaceholder('Add a task and press Enter…');
  await quickAdd.fill('Clear out shelves');
  await quickAdd.press('Enter');
  await quickAdd.fill('Install workbench');
  await quickAdd.press('Enter');
  await expect(win.getByText('Clear out shelves')).toBeVisible();

  // Open the second task and make it depend on the first, with a due date.
  await win.getByText('Install workbench').click();
  const dialog = win.getByRole('dialog', { name: 'Edit task' });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel('Due date').fill('2026-07-10');
  await dialog.getByLabel('Priority').selectOption('High');
  await dialog.getByText('Clear out shelves').click(); // Blocked-by checkbox row
  await dialog.getByRole('button', { name: 'Done' }).click();

  // The dependency shows as a blocked pill in the task list.
  const row = win.locator('.trow', { hasText: 'Install workbench' });
  await expect(row.getByText('blocked')).toBeVisible();
  await first.close();

  // Everything survives a restart.
  const second = await launch(userData);
  win = await second.firstWindow();
  const nav = win.getByRole('navigation', { name: 'Projects' });
  await nav.getByRole('button', { name: /Garage workshop/ }).click();
  await expect(win.getByText('Install workbench')).toBeVisible();
  const row2 = win.locator('.trow', { hasText: 'Install workbench' });
  await expect(row2.getByText('blocked')).toBeVisible();

  // Deleting the project asks for confirmation and cascades.
  await win.getByRole('button', { name: 'Delete', exact: true }).click();
  await win
    .getByRole('alertdialog', { name: 'Confirm' })
    .getByRole('button', { name: 'Delete' })
    .click();
  await expect(win.getByTestId('home-headline')).toBeVisible();
  await expect(nav.getByRole('button', { name: /Garage workshop/ })).toHaveCount(0);
  await second.close();
});
