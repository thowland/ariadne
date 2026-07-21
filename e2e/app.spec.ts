import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
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
  // Portfolio column renders project cards with their visualizations.
  await expect(win.getByTestId('project-card-p1')).toBeVisible();
  await expect(win.getByTestId('strip-p1')).toBeVisible();
  await expect(win.getByTestId('spark-p1')).toBeVisible();
  await expect(win.getByTestId('due-strip-p1')).toBeVisible();

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
  const row2 = win.locator('.trow', { hasText: 'Install workbench' });
  await expect(row2).toBeVisible();
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

test('calendar and dependency map are wired end-to-end', async () => {
  const userData = mkdtempSync(join(tmpdir(), 'ariadne-e2e-'));
  const app = await launch(userData);
  const win = await app.firstWindow();
  await expect(win.getByTestId('home-headline')).toBeVisible();

  // Calendar: July grid with today's chips; paging works.
  await win.getByRole('button', { name: 'Calendar' }).click();
  await expect(win.getByRole('heading', { name: 'July 2026' })).toBeVisible();
  await expect(
    win.getByTestId('calendar-grid').getByTitle('Write migration runbook'),
  ).toBeVisible();
  await win.getByRole('button', { name: 'Next month' }).click();
  await expect(win.getByRole('heading', { name: 'August 2026' })).toBeVisible();

  // Dependency map: open the migration project, click the cutover node.
  const nav = win.getByRole('navigation', { name: 'Projects' });
  await nav.getByRole('button', { name: /Q3 Platform Migration/ }).click();
  await expect(win.getByTestId('dependency-map')).toBeVisible();
  await win.getByTestId('dep-node-t5').click();
  const dialog = win.getByRole('dialog', { name: 'Edit task' });
  await expect(dialog.getByPlaceholder('Task title')).toHaveValue('Cutover & DNS switch');
  await app.close();
});

test('document library: markdown editing, CSV upload/preview, persistence', async () => {
  const userData = mkdtempSync(join(tmpdir(), 'ariadne-e2e-'));
  const csvPath = join(userData, 'inventory.csv');
  writeFileSync(csvPath, 'item,qty\nrope,2\n"tar, pitch",1\n');

  const first = await launch(userData);
  let win = await first.firstWindow();
  await expect(win.getByTestId('home-headline')).toBeVisible();

  // Open the migration project's seeded markdown file.
  const nav = win.getByRole('navigation', { name: 'Projects' });
  await nav.getByRole('button', { name: /Q3 Platform Migration/ }).click();
  await win.getByTestId('file-row-fa').click();
  const viewer = win.getByRole('dialog', { name: 'File viewer' });
  await expect(viewer.getByTestId('md-preview')).toContainText('Q3 Platform Migration');

  // Edit it; the preview reflects the change immediately (auto-save).
  await viewer.getByRole('tab', { name: 'Edit' }).click();
  await viewer.getByLabel('Markdown source').fill('# Rewritten\n\nNew **content** here.');
  await viewer.getByRole('tab', { name: 'Preview' }).click();
  await expect(viewer.getByTestId('md-preview')).toContainText('Rewritten');
  await viewer.getByLabel('Close').click();

  // Upload a CSV and preview it as a table (served over ariadne-blob://).
  await win.getByLabel('Upload files').setInputFiles(csvPath);
  await win
    .getByTestId(/file-row-/)
    .filter({ hasText: 'inventory.csv' })
    .click();
  const table = win.getByTestId('csv-table');
  await expect(table).toBeVisible();
  await expect(table.getByText('tar, pitch')).toBeVisible();
  await win.getByRole('dialog', { name: 'File viewer' }).getByLabel('Close').click();
  await first.close();

  // Both the edit and the uploaded blob survive a restart.
  const second = await launch(userData);
  win = await second.firstWindow();
  await win
    .getByRole('navigation', { name: 'Projects' })
    .getByRole('button', { name: /Q3 Platform Migration/ })
    .click();
  await win.getByTestId('file-row-fa').click();
  await expect(
    win.getByRole('dialog', { name: 'File viewer' }).getByTestId('md-preview'),
  ).toContainText('Rewritten');
  await win.getByRole('dialog', { name: 'File viewer' }).getByLabel('Close').click();
  await win
    .getByTestId(/file-row-/)
    .filter({ hasText: 'inventory.csv' })
    .click();
  await expect(win.getByTestId('csv-table').getByText('rope')).toBeVisible();
  await second.close();
});

test('reports render and settings can reset/clear the workspace', async () => {
  const userData = mkdtempSync(join(tmpdir(), 'ariadne-e2e-'));
  const app = await launch(userData);
  const win = await app.firstWindow();
  await expect(win.getByTestId('home-headline')).toBeVisible();

  // Reports: weekly blocks, scope isolation, portfolio table, at-risk.
  await win.getByRole('button', { name: 'Reports' }).click();
  await expect(win.getByTestId('weekly-p1')).toBeVisible();
  await win.getByLabel('Report scope').selectOption('home');
  await expect(win.getByTestId('weekly-p1')).toHaveCount(0);
  await expect(win.getByTestId('weekly-p3')).toBeVisible();
  await win.getByLabel('Report scope').selectOption('all');
  await win.getByRole('tab', { name: 'Portfolio roll-up' }).click();
  await expect(win.getByTestId('portfolio-table')).toContainText('Q3 Platform Migration');
  await win.getByRole('tab', { name: 'At-risk' }).click();
  await expect(win.getByText('Waiting on overdue: Migrate auth service')).toBeVisible();

  // Settings: clear all (confirmed) empties the app…
  await win.getByRole('button', { name: 'Settings' }).click();
  await expect(win.getByTestId('data-dir')).toContainText('/');
  await win.getByRole('button', { name: 'Clear all' }).click();
  await win.getByRole('alertdialog').getByRole('button', { name: 'Delete' }).click();
  await win.getByRole('button', { name: 'Command Center' }).click();
  await expect(win.getByText('You are all caught up. 🎉')).toBeVisible();

  // …and reset-to-sample restores the seed, surviving a restart.
  await win.getByRole('button', { name: 'Settings' }).click();
  await win.getByRole('button', { name: 'Reset to sample data' }).click();
  await win.getByRole('alertdialog').getByRole('button', { name: 'Delete' }).click();
  await app.close();

  const second = await launch(userData);
  const win2 = await second.firstWindow();
  await expect(win2.getByTestId('home-headline')).toHaveText('5 tasks need your attention today');
  await second.close();
});

test('backups: daily on startup, refreshed on quit, and on demand', async () => {
  const userData = mkdtempSync(join(tmpdir(), 'ariadne-e2e-'));
  const backupDay = join(userData, 'data', 'backups', FAKE_TODAY);

  // First run: the startup backup is skipped (no workspace yet, seeding
  // happens on load), but quitting writes today's backup.
  const first = await launch(userData);
  let win = await first.firstWindow();
  await expect(win.getByTestId('home-headline')).toBeVisible();
  await win.getByTitle('New project').click();
  await expect(win.getByLabel('Project name')).toHaveValue('Untitled project');
  await first.close();

  expect(existsSync(join(backupDay, 'projects.json'))).toBe(true);
  expect(existsSync(join(backupDay, 'blobs'))).toBe(true);
  const backedUp = JSON.parse(readFileSync(join(backupDay, 'projects.json'), 'utf8')) as {
    name: string;
  }[];
  expect(backedUp.some((p) => p.name === 'Untitled project')).toBe(true);

  // Second run: "Back up now" refreshes the same day folder.
  const second = await launch(userData);
  win = await second.firstWindow();
  await expect(win.getByTestId('home-headline')).toBeVisible();
  await win.getByRole('button', { name: 'Settings' }).click();
  await expect(win.getByTestId('backup-dir')).toContainText('backups (default)');
  await win.getByRole('button', { name: 'Back up now' }).click();
  await expect(win.getByText(/Backed up to/)).toBeVisible();
  await second.close();
});

test('debug logging: enabled in Settings, records activity, survives restart', async () => {
  const userData = mkdtempSync(join(tmpdir(), 'ariadne-e2e-'));
  const logFile = join(userData, 'logs', 'ariadne-debug.log');

  const first = await launch(userData);
  let win = await first.firstWindow();
  await expect(win.getByTestId('home-headline')).toBeVisible();

  await win.getByRole('button', { name: 'Settings' }).click();
  await expect(win.getByTestId('log-dir')).toContainText('logs (default)');
  expect(existsSync(logFile)).toBe(false);
  await win.getByLabel('Enable debug logging').check();

  // Some activity to record: navigate home and create a project.
  await win.getByRole('button', { name: 'Command Center' }).click();
  await win.getByTitle('New project').click();
  await expect(win.getByLabel('Project name')).toHaveValue('Untitled project');
  await first.close();

  const content = readFileSync(logFile, 'utf8');
  expect(content).toContain('[app] debug logging enabled');
  expect(content).toContain('[activity] edit applied: settings');
  expect(content).toContain('[activity] navigate: home');
  expect(content).toContain('[activity] edit applied: projects 6→7');
  expect(content).toContain('[backup] backup starting');
  expect(content).toContain('[app] quit requested');

  // The setting persists: the next session logs its own startup line.
  const second = await launch(userData);
  win = await second.firstWindow();
  await expect(win.getByTestId('home-headline')).toBeVisible();
  await second.close();
  expect(readFileSync(logFile, 'utf8')).toContain('[app] Ariadne starting');
});

test('tags: autocomplete while typing, chip click searches, management on the Tags page', async () => {
  const userData = mkdtempSync(join(tmpdir(), 'ariadne-e2e-'));
  const app = await launch(userData);
  const win = await app.firstWindow();
  await expect(win.getByTestId('home-headline')).toBeVisible();

  // Autocomplete: typing "in" in the migration project suggests #infra... no,
  // infra is already on p1 — it suggests nothing there; use p3 instead.
  const nav = win.getByRole('navigation', { name: 'Projects' });
  await nav.getByRole('button', { name: /Refinish boat table/ }).click();
  await win.getByPlaceholder('+ tag').fill('in');
  const suggestions = win.getByRole('listbox', { name: 'Tag suggestions' });
  await expect(suggestions.getByText('#infra')).toBeVisible();
  await suggestions.getByText('#infra').click();
  await expect(win.getByTitle('Search for #infra')).toBeVisible();

  // Chip click → search results across projects and tasks with that tag.
  await win.getByTitle('Search for #infra').click();
  await expect(win.getByTestId('search-summary')).toContainText('matching “infra”');
  await expect(win.getByTestId('project-card-p1')).toBeVisible(); // tagged infra
  await expect(win.getByTestId('project-card-p3')).toBeVisible(); // just tagged

  // Tags page: merge #infra into #q3, then it disappears from the list.
  await win.getByPlaceholder('Search tasks & projects…').fill('');
  await win.getByRole('button', { name: 'Tags', exact: true }).click();
  const list = win.getByTestId('tag-manage-list');
  const infraRow = list.locator('.tag-manage-row', { hasText: '#infra' });
  await infraRow.getByRole('button', { name: 'Rename…' }).click();
  await win.getByLabel('New name for infra').fill('q3');
  await win.getByLabel('New name for infra').press('Enter');
  const dialog = win.getByRole('alertdialog', { name: 'Confirm' });
  await expect(dialog).toContainText('Merge #infra into existing tag #q3?');
  await dialog.getByRole('button', { name: 'Delete' }).click();
  await expect(list.locator('.tag-manage-row', { hasText: '#infra' })).toHaveCount(0);
  await app.close();
});

test('AI import wizard opens, gates on the API key, and cancels cleanly', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'ariadne-e2e-'));
  const app = await launch(dir);
  const win = await app.firstWindow();
  await expect(win.getByText('Command Center').first()).toBeVisible();

  // Open from the top bar; without a key, extraction is refused inline.
  await win.getByRole('button', { name: 'AI import…' }).click();
  const wizard = win.getByRole('dialog', { name: 'AI task import' });
  await expect(wizard).toBeVisible();
  await wizard.getByLabel('Text to extract tasks from').fill('call the vet tomorrow');
  await wizard.getByRole('button', { name: 'Extract tasks' }).click();
  await expect(wizard.getByRole('alert')).toContainText('Anthropic API key');

  // The inline shortcut lands on Settings with the key field.
  await wizard.getByRole('button', { name: 'Open Settings' }).click();
  await expect(win.getByLabel('Anthropic API key')).toBeVisible();
  await win.getByLabel('Anthropic API key').fill('sk-ant-test');

  // Re-open via the Settings card; cancel closes without side effects.
  await win.getByRole('button', { name: 'Import tasks…' }).click();
  await expect(win.getByRole('dialog', { name: 'AI task import' })).toBeVisible();
  await win.getByRole('button', { name: 'Cancel' }).click();
  await expect(win.getByRole('dialog', { name: 'AI task import' })).toHaveCount(0);
  await app.close();
});

test('archive lifecycle, files library, and tags view', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'ariadne-e2e-'));
  const app = await launch(dir);
  const win = await app.firstWindow();
  await expect(win.getByTestId('home-headline')).toBeVisible();

  // Files library lists every project's files; a row opens the viewer.
  await win.getByRole('button', { name: 'Files', exact: true }).click();
  await expect(win.getByTestId('files-headline')).toHaveText('5 files across 3 projects');
  await win.getByText('Migration overview.md').click();
  await expect(win.getByRole('dialog', { name: 'File viewer' })).toBeVisible();
  await win.keyboard.press('Escape');

  // Tags view shows workspace tags; clicking one searches for it.
  await win.getByRole('button', { name: 'Tags', exact: true }).click();
  await expect(win.getByTestId('tags-cloud')).toBeVisible();
  await win.getByTestId('tags-cloud').getByText('#woodworking').click();
  await expect(win.getByTestId('search-summary')).toContainText('matching “woodworking”');
  await win.getByPlaceholder('Search tasks & projects…').fill('');

  // Archive p3 from its detail screen: gone from sidebar list + portfolio,
  // reachable through the ARCHIVED section, and restorable from there.
  const projectNav = win.getByRole('navigation', { name: 'Projects' });
  await projectNav.getByRole('button', { name: /Refinish boat table/ }).click();
  await win.getByLabel('Archive this project').check();
  await expect(projectNav.getByRole('button', { name: /Refinish boat table/ })).toHaveCount(0);
  await win.getByRole('button', { name: 'Command Center' }).click();
  await expect(win.getByTestId('project-card-p3')).toHaveCount(0);

  // Survives a restart, then restore via the archived section.
  await app.close();
  const second = await launch(dir);
  const win2 = await second.firstWindow();
  await expect(win2.getByTestId('home-headline')).toBeVisible();
  await expect(win2.getByTestId('project-card-p3')).toHaveCount(0);
  await win2.getByRole('button', { name: /ARCHIVED \(1\)/ }).click();
  await win2
    .getByRole('navigation', { name: 'Archived projects' })
    .getByRole('button', { name: /Refinish boat table/ })
    .click();
  await win2.getByLabel('Archive this project').uncheck();
  await expect(
    win2.getByRole('navigation', { name: 'Projects' }).getByRole('button', {
      name: /Refinish boat table/,
    }),
  ).toBeVisible();
  await second.close();
});

test('calendar week view, retro presets, and report visuals', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'ariadne-e2e-'));
  const app = await launch(dir);
  const win = await app.firstWindow();
  await expect(win.getByTestId('home-headline')).toBeVisible();

  // Command Center: "Due this week" respects the Sun–Sat boundary — the
  // Critical accountant task due Sun Jul 12 sits in High priority · later.
  await expect(win.getByTestId('stat-due-this-week')).toContainText('7');
  await expect(
    win.getByTestId('focus-high-priority-later').getByText('Meet with accountant'),
  ).toBeVisible();

  // Calendar: toggle to the week view and page it.
  await win.getByRole('button', { name: 'Calendar' }).click();
  await win.getByRole('tab', { name: 'Week' }).click();
  await expect(win.getByRole('heading', { name: 'Jul 5 – Jul 11, 2026' })).toBeVisible();
  await expect(win.getByTestId('calendar-week-grid').getByTitle('Sand to 220 grit')).toBeVisible();
  await win.getByRole('button', { name: 'Next week' }).click();
  await expect(win.getByRole('heading', { name: 'Jul 12 – Jul 18, 2026' })).toBeVisible();

  // Reports: weekly pills, portfolio progress, retro preset + chart.
  await win.getByRole('button', { name: 'Reports' }).click();
  await expect(win.getByTestId('weekly-p3').getByText('2 at risk')).toBeVisible();
  await win.getByRole('tab', { name: 'Portfolio roll-up' }).click();
  await expect(win.getByTestId('portfolio-table').getByText('17%')).toBeVisible();
  await win.getByRole('tab', { name: 'Retrospective' }).click();
  await expect(win.getByTestId('retro-chart')).toBeVisible();
  await win.getByLabel('Date range preset').selectOption('month-to-date');
  await expect(win.getByLabel('From date')).toHaveValue('2026-07-01');
  await expect(win.getByTestId('retro-headline')).toContainText('tasks completed · Jul 1 – Jul 8');

  await app.close();
});
