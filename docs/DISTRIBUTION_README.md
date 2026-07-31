# Ariadne — Read me

Ariadne is a personal project & task tracker. It is **local-first and
single-user**: there is no account, no login, and no cloud — everything you
enter stays in plain files on your own computer. The app never talks to the
internet except for the two optional integrations described below (Todoist
and AI task import), and only when you use them.

## Installing

**Windows** — run `Ariadne Setup <version>.exe`. The installer is not
code-signed, so Windows SmartScreen will show "Windows protected your PC":
click **More info**, then **Run anyway**. It installs per-user (no admin
rights needed) and adds Ariadne to the Start menu.

**macOS** — open the DMG and drag **Ariadne** into **Applications**. The app
is not notarized, so macOS will balk at the first launch:

- **macOS 14 or earlier**: right-click the app → **Open** (instead of a
  double-click), then confirm.
- **macOS 15 (Sequoia) or later**: double-click it once and dismiss the
  warning, then go to **System Settings → Privacy & Security**, scroll down,
  and click **Open Anyway**.

**Linux** — make the AppImage executable (`chmod +x`) and run it, or install
the `.deb`.

## First run

Ariadne opens with a **sample dataset** so you can poke around — the
projects and tasks you see are demo data. When you are ready to start fresh:
**Settings → Data → Clear all**. (If you ever want the demo back:
**Reset to sample data**.)

## The basics

- **Projects** are either **Work** or **Home**. That category drives the
  All / Work / Home scope toggle on the Command Center and Calendar, and the
  scoping in reports — work and home never mix unless you ask.
- **Tasks** have a status, priority (Critical/High/Medium/Low), optional due
  date, tags, notes, subtasks, and links. Click a task's status circle to
  advance it: **Todo → Doing → Waiting → Done → back to Todo**. "Dropped" is
  only available from the status dropdown, so you can't hit it by accident.
- **Dependencies**: a task can depend on other tasks in the same project.
  A task with an unfinished dependency shows as **Blocked**; each project
  page has a **Dependency map** that draws the chain. The map lays itself
  out automatically, but you can drag any box where you want it — the
  connecting lines follow and re-route to whichever sides face each other,
  so a tangled graph can be pulled into something readable. Your
  arrangement is saved with the project; the strip under the map drags
  (or arrow-keys) to make the card taller, and **Reset layout** in the
  card header puts everything back on the automatic rows. A plain click
  still opens the task.
- **At risk** means a task is overdue, or directly waiting on an overdue
  task (it will tell you which one).
- The **Command Center** (home screen) groups what matters now: Overdue,
  Due today, Due this week, High priority · later, and Blocked. "This week"
  means the current calendar week (Sunday through Saturday) — a task due
  next Monday waits in "High priority · later" until its week starts.
  Each project card in the Portfolio column shows a colored strip of its
  task states, a small bar chart of completions per week (is this project
  moving?), and a row of day cells showing this week's due load — hover
  over any of them for the exact numbers.
- **Archiving**: when a project is finished (or parked), tick **Archive this
  project** on its page — or drag it onto the **DROP TO ARCHIVE** zone that
  appears at the bottom of the sidebar while dragging. Archived projects
  vanish from the sidebar, Command Center, calendar, and reports, but
  nothing is deleted: open the sidebar's **ARCHIVED** section and un-tick
  the box to bring one back. The one report that still counts them is the
  **Retrospective** — it looks backwards, so work you finished before
  parking a project keeps showing up there, marked "archived".
- The **search box** in the top bar searches all tasks and projects as you
  type. **Escape** closes any dialog.
- **Calendar** shows tasks by due date, as a month grid or a single
  Sun–Sat week (the Month/Week toggle); click a day for its list.
- **Reports** offers Weekly status, Portfolio roll-up, Retrospective, and
  At-risk — each scopable to All / Work / Home / a #tag, with a
  **Copy report** button that puts a plain-text version on the clipboard.
  The retrospective has quick range presets (last week, last month, month
  to date, year to date) and a chart of completions over time; it is the
  only report that includes archived projects.
- Each project has a **Files & documents** card: create markdown notes
  in-app or upload files (PDF, CSV, DOCX, XLSX, PPTX, RTF, images). Images,
  PDFs, and CSVs preview inside Ariadne. The **Files** view in the sidebar
  lists every file across all projects in one place.
- The **Tags** view in the sidebar shows every tag you use, with counts —
  click one to search for everything carrying it.

## Where your data lives

Everything is plain JSON plus your uploaded files, in a data folder you can
open and back up yourself:

- Windows: `%APPDATA%\Ariadne\data`
- macOS: `~/Library/Application Support/Ariadne/data`
- Linux: `~/.config/Ariadne/data`

You can move the data folder somewhere else (a synced drive, for example)
via **Settings → Data → Change…** — Ariadne migrates the files and
relaunches itself.

## Backups

Ariadne backs itself up automatically: **once a day when it launches, and
again every time you quit**, so the newest backup always matches the state
you last saw. You can also click **Settings → Backups → Back up now** at any
time.

- Backups live in a `backups` folder inside your data folder (location
  shown and changeable under **Settings → Backups**). Each day gets its own
  dated folder, e.g. `backups/2026-07-15/`, containing a full copy of the
  workspace including uploaded files.
- The newest **10** daily backups are kept by default (adjustable 1–100
  under **DAYS TO KEEP**); older ones are deleted automatically.
- **To restore a backup:** quit Ariadne, then copy the files from the dated
  backup folder over the ones in your data folder, and start the app again.
  (If a data file is ever corrupted, Ariadne quarantines it and restores
  from the newest backup on its own.)
- For an extra safety net — or to move to a new computer — use
  **Settings → Data → Export JSON**. That writes a single
  `ariadne-export-<date>.json` containing everything, which
  **Import file…** on any machine can load back in.

## AI task import (optional)

Paste any messy text — meeting notes, an email thread, a brain dump — and
Claude (Anthropic's AI) pulls out the action items with due dates and
priorities, then walks you through them one at a time before anything is
created.

Setup — you need your own Anthropic API key (pay-as-you-go; a typical
import costs a few cents):

1. Create a key at **console.anthropic.com → API keys**.
2. In Ariadne, open **Settings → Integrations · Claude AI** and paste it
   into **ANTHROPIC API KEY**.
3. Click **AI import…** in the top bar (or **Import tasks…** in that same
   settings card), paste your text, and press **Extract tasks**.
4. Review each candidate: edit the title, project, due date, priority, or
   notes, then **Add task** or **Skip**. Tasks that don't match one of your
   projects are filed under an auto-created **AI Imported** project so you
   can re-file them later.

Privacy notes: only the text you paste is sent to Anthropic, and only for
that one request. The API key is stored **in plain text** in Ariadne's local
settings file — treat that file like a password.

## Todoist (optional)

Connect a Todoist account under **Settings → Integrations · Todoist** by
pasting your API token (find it in Todoist under
**Settings → Integrations → Developer**). Ariadne sends tasks to Todoist and
watches for them coming back completed; it never creates Ariadne tasks from
Todoist.

- **Push to Todoist** sends open Ariadne tasks due in the next **7** days
  (adjustable 1–60) into a **#Home** or **#Work** Todoist project, labelled
  `@ariadne` plus the Ariadne project's name. Already-pushed tasks are
  remembered, so pushing again never creates duplicates. You can also push a
  single task from its editor, whatever its due date.
- **Completion sync** watches the tasks you pushed and, when you tick one off
  in Todoist, marks it Done here with Todoist's completion date. It looks at
  the last 30 days of completions, touches open tasks only, and is safe to run
  repeatedly — nothing is created, deleted, or reopened. Run it with **Sync
  now**, or set the schedule to hourly or daily.

Like the AI key, the token is stored in plain text on your computer.

## Updating

Ariadne does not auto-update. To upgrade, download a newer version from
https://github.com/thowland/ariadne/releases and install it the same way you
installed this one — your data folder and backups are untouched.

## If something goes wrong

Ariadne keeps a log at `logs/main.log` next to the data folder (inside the
Ariadne folder listed above). If the app misbehaves, quit and relaunch it
first; your data is written to disk continuously and again on quit, and the
daily backups above are your safety net.

If a problem is repeatable and you want it looked at, turn on **Settings →
Debug logging** first, reproduce the problem, then click **Show log file** to
find `ariadne-debug.log`. That log records what the app was doing —
navigation, saves, backup runs, sync attempts, and failures — and stays on
your machine until you choose to send it. It does not contain the text of
your tasks or notes.

Report problems at https://github.com/thowland/ariadne/issues, and attach the
debug log if it is relevant.

## Source and license

Ariadne is free software under the GNU General Public License, version 3 or
later. The source is at https://github.com/thowland/ariadne, and the full
license text ships with it. You may use, study, modify, and pass it along;
if you distribute a modified version, you have to offer the source under the
same terms. There is no warranty.
