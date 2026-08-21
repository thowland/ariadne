import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { ElectronApplication } from '@playwright/test';
import { _electron as electron, expect, test } from '@playwright/test';

const FAKE_TODAY = '2026-07-08';

// Read rather than hard-coded: About shows app.getVersion(), so pinning a
// literal here turns every release bump into a spurious E2E failure.
const APP_VERSION = (
  JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf8')) as { version: string }
).version;

function launch(userDataDir: string): Promise<ElectronApplication> {
  return electron.launch({
    // The project root, not out/main/index.js: Electron then reads the real
    // package.json (via its "main" entry), so app.getName()/getVersion()
    // report Ariadne's identity in tests exactly as they do when packaged.
    args: ['.'],
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
  const quickAdd = win.getByLabel('Add a task');
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
  await dialog.getByRole('button', { name: 'Close' }).click();

  // Drag a node to a new spot; it stays there and survives a restart.
  const node = win.getByTestId('dep-node-t3');
  const rect = node.locator('rect');
  const before = await rect.getAttribute('x');
  const box = await node.boundingBox();
  if (box === null) throw new Error('no node box');
  await win.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await win.mouse.down();
  await win.mouse.move(box.x + box.width / 2 + 120, box.y + box.height / 2 + 60, { steps: 8 });
  await win.mouse.up();
  const after = await rect.getAttribute('x');
  expect(after).not.toBe(before);
  // A drag is not a click — the editor stayed shut.
  await expect(win.getByRole('dialog', { name: 'Edit task' })).toHaveCount(0);
  await app.close();

  const app2 = await launch(userData);
  const win2 = await app2.firstWindow();
  await win2
    .getByRole('navigation', { name: 'Projects' })
    .getByRole('button', { name: /Q3 Platform Migration/ })
    .click();
  await expect(win2.getByTestId('dep-node-t3').locator('rect')).toHaveAttribute('x', after ?? '');

  // Reset puts it back on the automatic layer.
  await win2.getByRole('button', { name: 'Reset layout' }).click();
  await expect(win2.getByTestId('dep-node-t3').locator('rect')).toHaveAttribute('x', before ?? '');
  await app2.close();
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

test('natural-language dates highlight in the title and set the due date (D29)', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'ariadne-e2e-'));
  const app = await launch(dir);
  const win = await app.firstWindow();
  await expect(win.getByTestId('home-headline')).toBeVisible();

  await win
    .getByRole('navigation', { name: 'Projects' })
    .getByRole('button', { name: /Q3 Platform Migration/ })
    .click();

  // Quick add: the phrase is highlighted and the date rides along.
  const quick = win.getByLabel('Add a task');
  await quick.fill('call the vendor tomorrow');
  await expect(win.getByTestId('nl-date-chip')).toHaveText(/Tomorrow/);

  // The mark must actually sit over the word, not merely exist — that is the
  // whole risk of the mirror technique, and jsdom (no layout) cannot check it.
  const mark = await win.locator('.nl-hit').boundingBox();
  const input = await win.locator('.nl-input').boundingBox();
  expect(mark).not.toBeNull();
  expect(input).not.toBeNull();
  expect(mark!.x).toBeGreaterThanOrEqual(input!.x - 1);
  expect(mark!.x + mark!.width).toBeLessThanOrEqual(input!.x + input!.width + 1);
  // A real word's worth of width: a collapsed or zero-width mark is a failure.
  expect(mark!.width).toBeGreaterThan(10);

  await quick.press('Enter');
  await win.getByText('call the vendor tomorrow').first().click();
  const editor = win.getByRole('dialog', { name: 'Edit task' });
  // ARIADNE_FAKE_TODAY is 2026-07-08, so "tomorrow" is the 9th.
  await expect(editor.getByLabel('Due date')).toHaveValue('2026-07-09');
  // The phrase stays in the title exactly as typed.
  await expect(editor.getByLabel('Task title')).toHaveValue('call the vendor tomorrow');
  await editor.getByLabel('Close').click();

  // Dismissing the highlight drops the date but keeps the words.
  await quick.fill('review the deck friday');
  await expect(win.getByTestId('nl-date-chip')).toBeVisible();
  await win.getByTestId('nl-date-chip').click();
  await expect(win.getByTestId('nl-date-chip')).toHaveCount(0);
  await quick.click();
  await quick.press('Enter');
  await win.getByText('review the deck friday').first().click();
  const editor2 = win.getByRole('dialog', { name: 'Edit task' });
  await expect(editor2.getByLabel('Due date')).toHaveValue('');
  await expect(editor2.getByLabel('Task title')).toHaveValue('review the deck friday');
  await app.close();
});

/**
 * app.setBadgeCount only reaches a real badge on macOS and on Linux desktops
 * with a Unity launcher. CI runs headless Ubuntu under xvfb, where the call
 * no-ops and getBadgeCount stays 0 — so the OS-level assertions are gated on
 * the platform. The counting logic and the renderer's push are covered
 * cross-platform by the unit suite (derive.test.ts, App.test.tsx); what only
 * an E2E can prove is that the IPC actually reaches the OS, and that is
 * exactly the platform-specific part.
 */
const HAS_OS_BADGE = process.platform === 'darwin';

test('the dock badge follows the setting and the workspace (D28)', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'ariadne-e2e-'));
  const app = await launch(dir);
  const win = await app.firstWindow();
  await expect(win.getByTestId('home-headline')).toBeVisible();

  // Reads the value Electron actually handed the OS, not our own state.
  const badge = async (): Promise<number> => app.evaluate(({ app: a }) => a.getBadgeCount());
  const select = win.getByLabel('Dock badge');

  // Off by default: an existing workspace gains no badge on upgrade.
  if (HAS_OS_BADGE) expect(await badge()).toBe(0);

  await win.getByRole('button', { name: 'Settings' }).click();
  await expect(select).toHaveValue('none');

  await select.selectOption('overdue');
  if (HAS_OS_BADGE) await expect.poll(badge).toBe(3); // seeded overdue tasks

  await select.selectOption('due');
  if (HAS_OS_BADGE) await expect.poll(badge).toBe(2); // seeded tasks due today

  await select.selectOption('none');
  if (HAS_OS_BADGE) await expect.poll(badge).toBe(0);

  // The choice survives a restart — true on every platform, badge or not.
  await select.selectOption('overdue');
  if (HAS_OS_BADGE) await expect.poll(badge).toBe(3);
  await app.close();

  const second = await launch(dir);
  const win2 = await second.firstWindow();
  await expect(win2.getByTestId('home-headline')).toBeVisible();
  await win2.getByRole('button', { name: 'Settings' }).click();
  await expect(win2.getByLabel('Dock badge')).toHaveValue('overdue');
  if (HAS_OS_BADGE) {
    await expect.poll(async () => second.evaluate(({ app: a }) => a.getBadgeCount())).toBe(3);
  }
  await second.close();
});

test('dragging a task onto a sidebar project reassigns it', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'ariadne-e2e-'));
  const app = await launch(dir);
  const win = await app.firstWindow();
  await expect(win.getByTestId('home-headline')).toBeVisible();

  // Open the project the task lives in.
  const projectNav = win.getByRole('navigation', { name: 'Projects' });
  await projectNav.getByRole('button', { name: /Q3 Platform Migration/ }).click();
  const task = win.getByText('Write migration runbook').first();
  await expect(task).toBeVisible();

  // Drag it onto a different project in the sidebar.
  await task.dragTo(projectNav.getByRole('button', { name: /2025 Taxes/ }));
  await expect(win.locator('.toast')).toContainText('moved to 2025 Taxes');
  // Gone from the project it left…
  await expect(win.getByText('Write migration runbook')).toHaveCount(0);

  // …and present in the one it joined, across a restart.
  await app.close();
  const second = await launch(dir);
  const win2 = await second.firstWindow();
  await expect(win2.getByTestId('home-headline')).toBeVisible();
  await win2
    .getByRole('navigation', { name: 'Projects' })
    .getByRole('button', { name: /2025 Taxes/ })
    .click();
  await expect(win2.getByText('Write migration runbook')).toBeVisible();
  await second.close();
});

test('hiding completed tasks is remembered per project across a restart (D30)', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'ariadne-e2e-'));
  const app = await launch(dir);
  const win = await app.firstWindow();
  await expect(win.getByTestId('home-headline')).toBeVisible();

  const projectNav = win.getByRole('navigation', { name: 'Projects' });
  // Scoped to the task list: dependency-map nodes carry the same titles
  // (truncated), so an unscoped text match is not a reliable count.
  const taskList = win.locator('.focus-section-body');

  await projectNav.getByRole('button', { name: /Refinish boat table/ }).click();
  await expect(taskList.getByText('Strip old varnish')).toBeVisible();
  await win.getByLabel('Hide completed tasks').check();
  // Gone from the task list, still on the dependency map.
  await expect(taskList.getByText('Strip old varnish')).toHaveCount(0);
  await expect(win.getByTestId('dep-node-t13')).toBeVisible();

  // Another project is untouched — the setting belongs to the project.
  await projectNav.getByRole('button', { name: /Q3 Platform Migration/ }).click();
  await expect(win.getByLabel('Hide completed tasks')).not.toBeChecked();
  await expect(taskList.getByText('Audit legacy service dependencies')).toBeVisible();

  // Survives a restart, which is the whole point of persisting it.
  await app.close();
  const second = await launch(dir);
  const win2 = await second.firstWindow();
  await expect(win2.getByTestId('home-headline')).toBeVisible();
  await win2
    .getByRole('navigation', { name: 'Projects' })
    .getByRole('button', { name: /Refinish boat table/ })
    .click();
  await expect(win2.getByLabel('Hide completed tasks')).toBeChecked();
  await expect(win2.locator('.focus-section-body').getByText('Strip old varnish')).toHaveCount(0);
  await second.close();
});

test('projects inventory: sidebar heading opens it, rows open projects, archived gated', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'ariadne-e2e-'));
  const app = await launch(dir);
  const win = await app.firstWindow();
  await expect(win.getByTestId('home-headline')).toBeVisible();

  // The PROJECTS heading is a destination, not decoration.
  await win.getByRole('button', { name: 'PROJECTS' }).click();
  const table = win.getByTestId('projects-table');
  await expect(table).toBeVisible();
  await expect(win.getByTestId('projects-headline')).toContainText('6 projects');
  // Metadata the sidebar has no room for.
  await expect(win.getByTestId('projects-row-p1')).toContainText('#infra');
  await expect(win.getByTestId('projects-row-p1')).toContainText('5');

  // A row is a link to the project.
  await win.getByTestId('projects-row-p3').click();
  await expect(win.getByTestId('dependency-map')).toBeVisible();

  // Archive it, then confirm the inventory hides it until asked (D13).
  await win.getByLabel('Archive this project').check();
  await win.getByRole('button', { name: 'PROJECTS' }).click();
  await expect(win.getByTestId('projects-row-p3')).toHaveCount(0);
  await win.getByLabel(/Show archived/).check();
  await expect(win.getByTestId('projects-row-p3')).toBeVisible();

  // New project from the top bar lands on the new project's screen.
  await win.getByRole('button', { name: '+ New project' }).click();
  await expect(win.getByLabel('Project name')).toBeVisible();
  await app.close();
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

test('context menus and bulk reschedule drive real edits (D21)', async () => {
  const userData = mkdtempSync(join(tmpdir(), 'ariadne-e2e-'));
  const app = await launch(userData);
  const win = await app.firstWindow();
  await expect(win.getByTestId('home-headline')).toBeVisible();

  // --- Command Center: reschedule every overdue task onto today.
  const overdueCard = win.getByTestId('focus-overdue');
  await expect(overdueCard).toBeVisible();
  await win.getByTestId('reschedule-overdue').click();
  const confirm = win.getByRole('alertdialog', { name: 'Confirm' });
  await expect(confirm).toContainText('overdue task');
  await confirm.getByRole('button', { name: 'Reschedule' }).click();
  // Nothing is overdue any more, so the card and the sidebar badge go.
  await expect(win.getByTestId('focus-overdue')).toHaveCount(0);
  await expect(win.getByTestId('focus-due-today')).toBeVisible();

  // --- Task row: right-click → due tomorrow.
  const row = win.locator('.trow', { hasText: 'Migrate auth service' }).first();
  await row.click({ button: 'right' });
  const taskMenu = win.getByRole('menu');
  await expect(taskMenu).toBeVisible();
  await taskMenu.getByRole('menuitem', { name: 'Due tomorrow' }).click();
  await expect(win.getByRole('menu')).toHaveCount(0);
  // It leaves "due today" for the week section.
  await expect(
    win.getByTestId('focus-due-today').locator('.trow', { hasText: 'Migrate auth service' }),
  ).toHaveCount(0);

  // Escape closes a menu without acting.
  await row.click({ button: 'right' });
  await expect(win.getByRole('menu')).toBeVisible();
  await win.keyboard.press('Escape');
  await expect(win.getByRole('menu')).toHaveCount(0);

  // --- Sidebar: right-click a project → move all its tasks elsewhere.
  const nav = win.getByRole('navigation', { name: 'Projects' });
  await nav.getByRole('button', { name: /Q3 Platform Migration/ }).click({ button: 'right' });
  const projMenu = win.getByRole('menu');
  await projMenu.getByRole('menuitem', { name: /Move 6 tasks to project/ }).click();
  const moveDialog = win.getByRole('dialog', { name: 'Move tasks to project' });
  await expect(moveDialog).toBeVisible();
  await moveDialog.getByText('Refinish boat table').click();
  await moveDialog.getByRole('button', { name: 'Move 6 tasks' }).click();
  await expect(moveDialog).toHaveCount(0);

  // The source project is empty and the destination absorbed the work.
  await nav.getByRole('button', { name: /Q3 Platform Migration/ }).click();
  await expect(win.getByText('0 / 0 done')).toBeVisible();
  await nav.getByRole('button', { name: /Refinish boat table/ }).click();
  await expect(win.locator('.trow', { hasText: 'Migrate auth service' })).toBeVisible();
  // The chain travelled with them: the map draws it in its new home.
  await expect(win.getByTestId('dependency-map').getByTestId('dep-node-t5')).toBeVisible();

  // --- Sidebar: archive via the menu, and it moves to ARCHIVED.
  await nav.getByRole('button', { name: /Q3 Platform Migration/ }).click({ button: 'right' });
  await win.getByRole('menuitem', { name: 'Archive project' }).click();
  await expect(nav.getByRole('button', { name: /Q3 Platform Migration/ })).toHaveCount(0);
  await expect(win.getByRole('button', { name: /ARCHIVED \(1\)/ })).toBeVisible();
  await app.close();

  // Every one of those edits is on disk.
  const app2 = await launch(userData);
  const win2 = await app2.firstWindow();
  await win2
    .getByRole('navigation', { name: 'Projects' })
    .getByRole('button', { name: /Refinish boat table/ })
    .click();
  await expect(win2.locator('.trow', { hasText: 'Migrate auth service' })).toBeVisible();
  await app2.close();
});

test('menu commands drive the app: help, about, and the deferred report', async () => {
  const userData = mkdtempSync(join(tmpdir(), 'ariadne-e2e-'));
  const app = await launch(userData);
  const win = await app.firstWindow();
  await expect(win.getByTestId('home-headline')).toBeVisible();

  // The real application menu is installed (not Electron's default).
  const topLevel = await app.evaluate(({ Menu }) =>
    (Menu.getApplicationMenu()?.items ?? []).map((i) => i.label),
  );
  expect(topLevel).toEqual(expect.arrayContaining(['File', 'Edit', 'View', 'Window', 'Help']));

  /** Click a menu item by label, wherever it lives in the tree. */
  const clickMenu = async (label: string): Promise<void> => {
    await app.evaluate(({ Menu }, wanted) => {
      const walk = (items: Electron.MenuItem[]): Electron.MenuItem | null => {
        for (const i of items) {
          if (i.label === wanted) return i;
          // Electron types submenu as Menu | undefined, but a leaf item reports
          // null at runtime on macOS — widen so both are actually guarded.
          const sub = i.submenu as Electron.Menu | null | undefined;
          const found = sub == null ? null : walk(sub.items);
          if (found !== null) return found;
        }
        return null;
      };
      const item = walk(Menu.getApplicationMenu()?.items ?? []);
      if (item === null) throw new Error(`no menu item "${wanted}"`);
      (item.click as () => void)();
    }, label);
  };

  // Help → Ariadne Help opens the bundled help window and switches sections.
  await clickMenu('Ariadne Help');
  const help = win.getByRole('dialog', { name: 'Ariadne help' });
  await expect(help).toBeVisible();
  await help.getByRole('button', { name: 'Reports' }).click();
  await expect(win.getByTestId('help-body')).toContainText('The five reports');
  await help.getByLabel('Close').click();

  // About carries the version and the outbound links.
  await clickMenu('About Ariadne');
  await expect(win.getByTestId('about-version')).toContainText(`Version ${APP_VERSION}`);
  await expect(win.getByText('Source on GitHub ↗')).toBeVisible();
  await expect(win.getByTestId('about-runtime')).toContainText('Electron');
  await win.getByRole('dialog', { name: 'About Ariadne' }).getByLabel('Close').click();

  // View → Reports navigates, then the Deferred report renders the push-out
  // history the seeded workspace ships with (D23).
  await clickMenu('Reports');
  await win.getByRole('tab', { name: 'Deferred' }).click();
  await expect(win.getByTestId('defer-stats')).toBeVisible();
  await expect(win.getByTestId('defer-rows')).toContainText('Migrate auth service');

  // Push a due date out twice from the task editor; the report adds the new
  // pushes to the two the seed already recorded for this task.
  await clickMenu('Command Center');
  await win.getByText('Sand to 220 grit').first().click();
  const editor = win.getByRole('dialog', { name: 'Edit task' });
  await editor.getByLabel('Due date').fill('2026-07-20');
  await editor.getByLabel('Due date').fill('2026-08-20');
  await editor.getByLabel('Close').click();

  await clickMenu('Reports');
  await win.getByRole('tab', { name: 'Deferred' }).click();
  await win.getByLabel('Minimum reschedules').selectOption('2');
  await expect(win.getByTestId('defer-rows')).toContainText('Sand to 220 grit');
  await expect(win.getByTestId('defer-rows')).toContainText('4×');

  await app.close();
});

test('the file library accepts a drag-and-drop upload', async () => {
  const userData = mkdtempSync(join(tmpdir(), 'ariadne-e2e-'));
  const app = await launch(userData);
  const win = await app.firstWindow();
  await expect(win.getByTestId('home-headline')).toBeVisible();

  await win
    .getByRole('navigation', { name: 'Projects' })
    .getByRole('button', { name: /Q3 Platform Migration/ })
    .click();
  const zone = win.getByTestId('upload-dropzone');
  await expect(zone).toBeVisible();

  // Synthesize an OS-style drop with a real File on the DataTransfer.
  // The e2e project typechecks without the DOM lib, so the browser globals are
  // reached through a locally-typed view of globalThis.
  await zone.evaluate((el) => {
    const g = globalThis as unknown as {
      DataTransfer: new () => { items: { add: (file: unknown) => void } };
      File: new (bits: string[], name: string, opts: { type: string }) => unknown;
      DragEvent: new (type: string, init: Record<string, unknown>) => Event;
    };
    const dt = new g.DataTransfer();
    dt.items.add(new g.File(['col1,col2\n1,2\n'], 'dropped.csv', { type: 'text/csv' }));
    /* eslint-disable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access -- `el` has no resolvable type without the DOM lib */
    el.dispatchEvent(new g.DragEvent('drop', { dataTransfer: dt, bubbles: true }));
    /* eslint-enable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */
  });

  await expect(win.getByText('dropped.csv')).toBeVisible();
  await expect(win.getByText('1 file added to library')).toBeVisible();

  await app.close();
});

test('report exports: PDF from every tab, CSV and column sorting on the portfolio', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'ariadne-e2e-'));
  const out = mkdtempSync(join(tmpdir(), 'ariadne-out-'));
  const app = await launch(dir);
  const win = await app.firstWindow();
  await expect(win.getByTestId('home-headline')).toBeVisible();
  await win.getByRole('button', { name: 'Reports' }).click();

  const stubSave = async (filePath: string): Promise<void> => {
    await app.evaluate(({ dialog }, target) => {
      dialog.showSaveDialog = () => Promise.resolve({ canceled: false, filePath: target });
    }, filePath);
  };

  // Every report exports a real PDF, not just the one that happens to be open.
  for (const tab of [
    'Weekly status',
    'Portfolio roll-up',
    'Retrospective',
    'At-risk',
    'Deferred',
    'Contact activity',
  ]) {
    const target = join(out, `${tab.replace(/\W+/g, '-')}.pdf`);
    await stubSave(target);
    await win.getByRole('tab', { name: tab }).click();
    await win.getByRole('button', { name: 'Export PDF' }).click();
    await expect(win.getByText(/Saved .* PDF/)).toBeVisible();
    await expect.poll(() => existsSync(target)).toBe(true);
    // %PDF- header: proof Chromium actually printed, not that a file appeared.
    expect(readFileSync(target).subarray(0, 5).toString()).toBe('%PDF-');
  }

  // CSV is portfolio-only and carries raw ISO dates for a spreadsheet.
  await win.getByRole('tab', { name: 'Portfolio roll-up' }).click();
  const csv = join(out, 'portfolio.csv');
  await stubSave(csv);
  await win.getByRole('button', { name: 'Export CSV' }).click();
  await expect.poll(() => existsSync(csv)).toBe(true);
  const text = readFileSync(csv, 'utf8');
  expect(text.split('\r\n')[0]).toBe('Project,Type,Progress %,Open,Done,Overdue,Next due');
  expect(text).toContain('Q3 Platform Migration,work,17,5,1,1,2026-07-07');

  // Sorting: click a column, then click it again to reverse.
  const table = win.getByTestId('portfolio-table');
  const firstProject = async (): Promise<string | null> =>
    table.locator('tbody tr').first().locator('td').first().textContent();

  await table.getByRole('button', { name: /OVERDUE/ }).click();
  await expect(table.getByRole('columnheader', { name: /OVERDUE/ })).toHaveAttribute(
    'aria-sort',
    'descending',
  );
  expect(await firstProject()).toContain('2025 Taxes');

  await table.getByRole('button', { name: /OVERDUE/ }).click();
  await expect(table.getByRole('columnheader', { name: /OVERDUE/ })).toHaveAttribute(
    'aria-sort',
    'ascending',
  );
  expect(await firstProject()).toContain('Customer Onboarding Revamp');

  await app.close();
});

test('contacts: @-mention a person onto a task, see them everywhere, and survive a restart', async () => {
  const userData = mkdtempSync(join(tmpdir(), 'ariadne-e2e-'));

  const first = await launch(userData);
  let win = await first.firstWindow();
  await expect(win.getByTestId('home-headline')).toBeVisible();

  // Quick-add a task that @-mentions a seeded contact. The picker completes
  // the name and the typed "@tom" comes back out of the title.
  await win
    .getByRole('navigation', { name: 'Projects' })
    .getByRole('button', { name: /Refinish boat table/ })
    .click();
  const quickAdd = win.getByLabel('Add a task');
  await quickAdd.fill('Ask @tom');
  await win.getByRole('option', { name: /Tom Whitaker/ }).click();
  // The typed fragment completes to the full name and stays in the title.
  await expect(quickAdd).toHaveValue('Ask @Tom Whitaker');
  await expect(win.getByTestId('quick-add-people')).toContainText('Tom Whitaker');
  await quickAdd.fill('Ask @Tom Whitaker about the second coat');
  await quickAdd.press('Enter');
  await expect(win.getByText('Ask @Tom Whitaker about the second coat')).toBeVisible();

  // The card's "+ Add person" opens a real field listing everyone unlinked,
  // rather than focusing an invisible box that looks like a dead link.
  await win.getByRole('button', { name: '+ Add person' }).click();
  const picker = win.getByLabel('Add a contact to this project');
  await expect(picker).toBeFocused();
  await expect(win.getByRole('listbox', { name: 'Contact suggestions' })).toBeVisible();
  await picker.press('Escape');
  await expect(picker).toHaveCount(0);

  // He is on the project's Contacts card, sourced from the tasks.
  const card = win.getByTestId('project-contacts');
  await expect(card.getByText('Tom Whitaker')).toBeVisible();
  await expect(win.getByTestId('project-contact-c5')).toContainText('2 tasks');

  // The twisty opens the reachable details in place.
  await win.getByLabel('Tom Whitaker — show contact details').click();
  await expect(win.getByTestId('project-contact-c5')).toContainText('tom@harborline.example');

  // Search reaches contacts, including by a phone number typed without its
  // punctuation.
  await win.getByPlaceholder('Search tasks & projects…').fill('5554482201');
  await expect(win.getByTestId('search-summary')).toContainText('1 contact');
  await win.getByText('Tom Whitaker').first().click();
  await expect(win.getByTestId('contact-headline')).toHaveText('Tom Whitaker');
  await expect(win.getByText('Ask @Tom Whitaker about the second coat')).toBeVisible();

  // Edit a field on the detail page; it must come back after a restart.
  await win.getByLabel('Role').fill('Owner, Harborline Marine');
  await first.close();

  const second = await launch(userData);
  win = await second.firstWindow();
  await expect(win.getByTestId('home-headline')).toBeVisible();
  await win.getByRole('button', { name: 'Contacts', exact: true }).click();
  const row = win.getByTestId('contact-row-c5');
  await expect(row).toContainText('Owner, Harborline Marine');
  await expect(row).toContainText('Harborline Marine');
  // contacts.json is a real document on disk, next to the others.
  expect(existsSync(join(userData, 'data', 'contacts.json'))).toBe(true);

  await second.close();
});

test('contacts: the activity report ranks people and never leaks across scope', async () => {
  const userData = mkdtempSync(join(tmpdir(), 'ariadne-e2e-'));
  const app = await launch(userData);
  const win = await app.firstWindow();
  await expect(win.getByTestId('home-headline')).toBeVisible();

  await win.getByRole('button', { name: 'Reports' }).click();
  await win.getByRole('tab', { name: 'Contact activity' }).click();
  await expect(win.getByTestId('contact-stats')).toContainText('people involved');
  const rows = win.getByTestId('contact-rows');
  await expect(rows.getByText('Dana Reyes')).toBeVisible();
  await expect(rows.getByText('Elena Vasquez')).toBeVisible();

  // A work-scoped run cannot surface the accountant on a home project.
  await win.getByLabel('Report scope').selectOption('work');
  await expect(rows.getByText('Elena Vasquez')).toHaveCount(0);
  await expect(rows.getByText('Dana Reyes')).toBeVisible();

  await app.close();
});
