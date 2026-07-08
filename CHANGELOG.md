# Changelog

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
