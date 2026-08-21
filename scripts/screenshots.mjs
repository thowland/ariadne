/**
 * Regenerates the README screenshots from the seeded sample workspace.
 *
 *   npm run screenshots
 *
 * Deterministic by construction: a throwaway user-data dir means first-run
 * seeding, and ARIADNE_FAKE_TODAY pins "today" so the Command Center counts,
 * calendar grid, and retrospective range never drift. On the headless Linux VM
 * this needs `xvfb-run -a` like every other app run.
 */
import { mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { _electron as electron } from '@playwright/test';

const FAKE_TODAY = '2026-07-08';
const SIZE = { width: 1440, height: 900 };

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'docs', 'screenshots');

/** Each shot: a file name, and the clicks that get the app into that state. */
const SHOTS = [
  {
    name: 'command-center',
    async go() {
      /* the landing screen — nothing to do */
    },
  },
  {
    name: 'project-detail',
    async go(win) {
      await win
        .getByRole('navigation', { name: 'Projects' })
        .getByRole('button', { name: /Q3 Platform Migration/ })
        .click();
      await win.getByTestId('dependency-map').waitFor();
    },
  },
  {
    name: 'task-editor',
    async go(win) {
      await win
        .getByRole('navigation', { name: 'Projects' })
        .getByRole('button', { name: /Q3 Platform Migration/ })
        .click();
      await win.getByTestId('dep-node-t5').click();
      await win.getByRole('dialog', { name: 'Edit task' }).waitFor();
    },
  },
  {
    name: 'calendar',
    async go(win) {
      await win.getByRole('button', { name: 'Calendar' }).click();
      await win.getByTestId('calendar-grid').waitFor();
    },
  },
  {
    name: 'reports',
    async go(win) {
      await win.getByRole('button', { name: 'Reports' }).click();
      await win.getByTestId('weekly-p1').waitFor();
    },
  },
  {
    name: 'retrospective',
    async go(win) {
      await win.getByRole('button', { name: 'Reports' }).click();
      await win.getByRole('tab', { name: 'Retrospective' }).click();
      await win.getByTestId('retro-chart').waitFor();
    },
  },
  {
    name: 'files',
    async go(win) {
      await win.getByRole('button', { name: 'Files', exact: true }).click();
      await win.getByTestId('files-headline').waitFor();
    },
  },
  {
    // The @-mention flow in one frame: a name completed in place, the chip it
    // produced, and the offer to add somebody who is not in the book yet.
    name: 'task-mentions',
    async go(win) {
      await win
        .getByRole('navigation', { name: 'Projects' })
        .getByRole('button', { name: /Refinish boat table/ })
        .click();
      const quickAdd = win.getByLabel('Add a task');
      await quickAdd.fill('Ask @tom');
      await win.getByRole('option', { name: /Tom Whitaker/ }).click();
      await quickAdd.press('End');
      await quickAdd.type(' and @Nia Okoro', { delay: 10 });
      await win.getByRole('option', { name: /Add “Nia Okoro”/ }).waitFor();
    },
  },
  {
    name: 'contacts',
    async go(win) {
      await win.getByRole('button', { name: 'Contacts', exact: true }).click();
      await win.getByTestId('contacts-table').waitFor();
    },
  },
  {
    name: 'contact-detail',
    async go(win) {
      await win.getByRole('button', { name: 'Contacts', exact: true }).click();
      await win.getByTestId('contact-row-c1').click();
      await win.getByTestId('contact-headline').waitFor();
    },
  },
  {
    name: 'contact-activity',
    async go(win) {
      await win.getByRole('button', { name: 'Reports' }).click();
      await win.getByRole('tab', { name: 'Contact activity' }).click();
      await win.getByTestId('contact-rows').waitFor();
    },
  },
  {
    name: 'tags',
    async go(win) {
      await win.getByRole('button', { name: 'Tags', exact: true }).click();
      await win.getByTestId('tags-cloud').waitFor();
    },
  },
  {
    name: 'settings',
    async go(win) {
      await win.getByRole('button', { name: 'Settings' }).click();
      await win.getByTestId('data-dir').waitFor();
    },
  },
];

mkdirSync(outDir, { recursive: true });

for (const shot of SHOTS) {
  // A fresh workspace per shot: no shot can leave state that alters the next.
  const app = await electron.launch({
    args: ['out/main/index.js'],
    cwd: root,
    env: {
      ...process.env,
      ARIADNE_TEST_USER_DATA: mkdtempSync(join(tmpdir(), 'ariadne-shot-')),
      ARIADNE_FAKE_TODAY: FAKE_TODAY,
    },
  });
  const win = await app.firstWindow();
  const browserWindow = await app.browserWindow(win);
  await browserWindow.evaluate((w, size) => w.setContentSize(size.width, size.height), SIZE);
  await win.getByTestId('home-headline').waitFor();

  await shot.go(win);
  // Clicking a tab can scroll it under the sticky header; start every shot at
  // the top of whatever pane ended up scrolled.
  await win.evaluate(() => {
    for (const el of document.querySelectorAll('*')) el.scrollTop = 0;
    window.scrollTo(0, 0);
  });
  // Screens fade in on mount; without this the shot catches them half-opacity.
  await win.waitForTimeout(600);
  await win.screenshot({ path: join(outDir, `${shot.name}.png`), animations: 'disabled' });
  await app.close();
  console.log(`docs/screenshots/${shot.name}.png`);
}
