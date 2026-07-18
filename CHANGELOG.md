# Changelog

## 1.9.0 — 2026-07-18

- **Send a single task to Todoist**: the task editor's footer gains a
  **Send to Todoist** button. Unlike the bulk push in Settings there is no
  due-date window — undated and overdue tasks can be sent, since you picked
  the task yourself. The same safety rails apply: already-sent/imported tasks
  (`todoist:<id>` marker), Todoist Inbox tasks, closed tasks, and archived
  projects are refused with an explanation. Once a task is linked, the footer
  shows "In Todoist ✓" instead of the button, and it will never be pushed
  twice.

## 1.8.0 — 2026-07-17

- **Project-card visualizations** (Command Center portfolio): each card now
  carries three at-a-glance reads —
  - a **status-composition strip** in place of the plain progress bar
    (done / doing / blocked / waiting / todo segments, hover for counts);
  - a **momentum sparkline** of completions per week over the last 8 Sun–Sat
    weeks, current week highlighted (flat = stalled, on purpose);
  - a **due-load strip** for the current week — one cell per day shaded by
    how much is due, today ringed, past days dimmed, and any overdue tasks
    pooled in a red chip at the left. Everything has hover tooltips.

## 1.7.0 — 2026-07-17

- **Calendar week view**: a Month/Week toggle on the calendar. Week view lays
  out a single Sun–Sat week with roomier day columns, pages with the same
  ‹ Today › controls, and opens tasks/days like the month grid.
- **"Due this week" means this calendar week now**: weeks run Sunday–Saturday.
  The Command Center stat card and focus section stop at Saturday instead of
  counting 7 rolling days; a Critical/High task due next week surfaces under
  "High priority · later" until its week arrives.
- **Retrospective presets**: a range dropdown — Last week, Last month, Month
  to date, Year to date, Last 30 days — fills the date inputs; editing a date
  by hand switches to Custom range.
- **Report visualizations**: the retrospective gains a completions-over-time
  chart (daily bars up to a month of range, Sun–Sat weekly buckets beyond,
  hover for exact counts); the portfolio roll-up gains a per-project progress
  bar column; weekly status blocks summarize with done/planned/at-risk count
  pills in their headers.

## 1.6.1 — 2026-07-17

- **Security**: Electron upgraded 33.4.11 → 39.8.10, clearing all high-severity
  `npm audit` advisories (ASAR integrity bypass, several use-after-frees, IPC
  spoofing, and more). 39.8.10 is the newest major installable on the Node 18
  dev VM — Electron 40+ requires Node ≥ 22.
- Fixed the `ariadne-blob://` protocol under the new Chromium: renderer
  `fetch()` of uploaded files (CSV previews) is now CORS-enabled; image and
  PDF previews were unaffected. No user-facing behavior change.

## 1.6.0 — 2026-07-17

- **Archive projects**: an "Archive this project" checkbox on the project
  screen, or drag a project onto the sidebar's **DROP TO ARCHIVE** zone.
  Archived projects (and their tasks) disappear from the sidebar, Command
  Center, calendar, reports, Todoist push, and the task editor's project
  picker — but keep everything and come back via the sidebar's collapsible
  **ARCHIVED** section (or search) and un-checking the box.
- **Files library**: a new **Files** view (between Reports and Settings)
  lists every file across all projects and tasks, grouped by project, for
  quick browsing — rows open the regular viewer.
- **Tags view**: a new **Tags** view shows every tag in the workspace with
  usage counts; clicking one searches for it, just like clicking a tag chip
  on a project or task. Rename/merge/delete stay in Settings.
- **Stable task order while working a project**: clicking the status circle
  no longer reshuffles the project task list; the order is pinned for the
  visit and re-sorts (Doing → Todo → Waiting → Done) next time you open the
  project. New tasks append at the bottom.
- **Done can't be overdue**: completed/dropped tasks now show their old due
  date as a neutral gray date instead of a red "overdue" label — in project
  task lists and the weekly status report alike.
- **Command Center order**: focus sections now run Overdue → Due today →
  Due this week → High priority · later → Blocked.

## 1.5.0 — 2026-07-09

- **AI task import**: paste any chunk of text (meeting notes, emails, a brain
  dump) and Claude extracts the action items — with due dates resolved to real
  dates, priorities, and a suggested project. A wizard walks through each
  candidate so you can edit, re-assign, confirm, or skip it before it becomes
  a task. Tasks that don't map to an existing project are filed under a new
  "AI Imported" placeholder project until you re-file them.
- New **Integrations · Claude AI** card in Settings for the Anthropic API key
  (stored locally in plain text, like the Todoist token); "AI import…" button
  in the top bar. Extraction uses `claude-sonnet-5` via the official
  Anthropic SDK in the main process — the key never reaches the renderer.

## 1.4.0 — 2026-07-08

- **Sidebar**: reorder projects by dragging and dropping them; the order
  persists and drives the portfolio and reports everywhere.
- **At-risk redefined**: a task is at risk only if it is overdue, or directly
  depends on an overdue task (shown as "Waiting on overdue: <task>"). Having
  a dependency is how plans work — it no longer counts as risk. Applies to
  both the At-risk report and the weekly status "At risk" section.
- **Weekly status layout**: the cramped three-column layout is now stacked
  full-width sections (Done this week / Planned next / At risk).

## 1.3.0 — 2026-07-08

- **Push to Todoist** (Settings → Integrations): open tasks due within the
  next N days (configurable, 1–60, default 7) push into a Todoist **#Home**
  or **#Work** project (created if missing) with an `@project-name` label
  plus `@ariadne`, carrying due date, priority, and notes. Pushed tasks are
  marked so re-pushing never duplicates; a live preview shows how many tasks
  are ready. Pushes are idempotent even across retries (X-Request-Id).

## 1.2.0 — 2026-07-08

- **Tag autocomplete**: typing in any tag field (projects and tasks) suggests
  existing tags matching the typed prefix — pick with ↑/↓ + Enter or click;
  Enter on unmatched text still creates a new tag.
- **Tag management** (Settings → Tags): every tag with its project/task usage
  counts; rename inline (renaming onto an existing tag merges after a
  confirm), or delete a tag from everything.
- **Click-to-search**: clicking any tag chip runs a workspace-wide search for
  that tag across projects and tasks.
- Fix: the confirm dialog no longer focuses its destructive button, so the
  keystroke that triggered a confirm can never accept it in the same press.

## 1.1.0 — 2026-07-08

- **Calendar**: month cells are now a consistent fixed size regardless of how
  many tasks are due. Cells truncate to three chips plus "+N more"; clicking
  the day number (or "+N more") on any day with tasks opens a single-day view
  listing everything due, and tasks opened from it return there on close.
- **Automatic backups**: the whole workspace — JSON documents and uploaded
  files — is copied into a dated folder (`YYYY-MM-DD`) once per day and again
  when the app quits. The backup folder (default `backups/` inside the data
  directory) and retention (1–100 days, default 10) are configurable in
  Settings, alongside a "Back up now" button. Corrupt-file recovery now
  restores from these daily backups.

## 1.0.0 — 2026-07-08

First release. Ariadne is a single-user, local-first project & task tracker
built as an Electron desktop app; all data lives on your filesystem as
human-readable JSON plus ordinary files for attachments.

### Features

- **Command Center** — daily review with stat cards, an ambient overdue
  banner, focus sections (Overdue, Due today, Blocked, Due this week, High
  priority · later), and a portfolio column with progress and next-due labels
- **Projects** — editable workspace per project: tasks with inline quick-add,
  free-text notes, links, tags, Work/Home categorization
- **Tasks** — status (Todo/Doing/Waiting/Done/Dropped), priority, due dates,
  tags, notes, subtasks, links, file attachments, and predecessor
  ("Blocked by") dependencies with derived blocked indicators everywhere
- **Dependency map** — layered SVG graph of each project's task chains
- **Calendar** — month grid with priority-colored chips plus an Upcoming list
- **Document library** — per-project markdown notes (live preview/edit),
  uploads (PDF, CSV, images previewed inline; office formats downloadable),
  task attachments surface in both places
- **Reports** — weekly status, portfolio roll-up, date-ranged retrospective,
  and at-risk, all filterable by Work/Home/tag (work reports can never leak
  personal projects) and copyable as plain text
- **Todoist** — one-way import into a Todoist Inbox project with dedupe and
  re-import updates
- **Data ownership** — configurable data folder (point it at a synced
  directory), JSON export/import (accepts original prototype exports),
  rotating on-disk backups, atomic writes with corrupt-file recovery
- **No login** — single-user by design; the app opens straight into your day

### Quality

- 301 automated tests, ≥80% enforced coverage (actual ~97%), typed end to end
- Playwright E2E suite covering seed, editing, persistence-across-restart,
  library, reports, and settings flows
- Packaged for Linux (AppImage, deb); macOS/Windows targets configured
