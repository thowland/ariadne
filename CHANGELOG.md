# Changelog

## 1.21.0 — 2026-08-08

- **Hide completed tasks on a project, and have it stay hidden (D30).** A
  long-running backlog fills up with finished work that crowds out what is
  actually left. The Tasks card now offers a **Hide N completed** switch, and
  the choice sticks to that project — it survives a restart and does not follow
  you to your other projects, which may well want their history in view. The
  dependency map still shows everything, so nothing points at a task that
  vanished.
- **The projects list has room to breathe.** The table sat flush against its
  card, with the column headings pressed into the top edge. It now has proper
  padding and taller rows.

## 1.20.0 — 2026-08-07

- **Type a date into a task title and Ariadne picks it up (D29).** "Call the
  vendor tomorrow", "review the deck friday", "invoice aug 5" — the phrase is
  underlined as you type and a chip beside the field shows the date it would
  set. The words stay in the title, where they read naturally. If the guess is
  wrong, click the chip and the date goes away. It understands today and
  tomorrow, weekday names and their usual abbreviations, "in 3 days", "next
  week", a month and day in either order, and a plain ISO date. It is
  deliberately cautious about what counts as a date, so "satisfy the auditor"
  and "marching orders" are left alone.
- **A project list that shows the numbers.** The PROJECTS heading in
  the sidebar was the one label in the app that did nothing; it now opens a
  sortable table of every project — type, progress, open, done, overdue, next
  due and tags. Click any heading to sort, click a row to open the project.
  Archived projects stay out of it unless you ask for them.
- **Drag a task onto a project to move it.** Pick a task up from any list and
  drop it on a project in the sidebar. Dependencies that cannot survive the
  move are unlinked, and files attached to the task go with it — the same
  rules as the existing "move tasks to project" command.
- **An optional dock badge (D28).** Ariadne can show a count on its dock icon:
  nothing (the default), tasks due today, or tasks already overdue. It counts
  your whole workspace rather than whichever Work/Home tab you last had open,
  and updates the moment the number changes. Set it in Settings → Dock badge.
  macOS and Unity-style Linux launchers show it; Windows has no equivalent.
- **A New project button** next to New task, so starting a project no longer
  means hunting for the sidebar's "+".
- **.txt and .log files preview in the app** instead of offering only a
  download, with their spacing intact.
- **Fixed: dates that do not exist were accepted.** "2026-02-30" was quietly
  treated as valid and became March 2. Impossible dates are now rejected
  wherever Ariadne validates one, including imports and stored workspaces.

## 1.19.2 — 2026-08-07

- **The deferred report's PDF export is laid out properly.** The printed page
  is built from its own stylesheet rather than the app's, and that stylesheet
  had no rules for anything the deferred report draws. The eight headline
  numbers across the top — which sit in a grid on screen — unpacked into
  sixteen stacked lines at body size, and each task's reschedule count, title
  and due label ran together. All of it now prints in the shape it has on
  screen: four columns of statistics, one line per task, and the two
  breakdowns side by side. The at-risk report shared the same missing rules
  and is fixed with it.
- **A completed task no longer looks overdue in the deferred report.** A task
  that finally shipped after several reschedules showed "Completed" in the
  same red as genuinely late work, on screen and on paper. It's now neutral.
- **The sample workspace has a reschedule history.** The deferred report was
  the one report the demo data never exercised, so a new install showed only
  its empty state — and its print bug went unnoticed. The sample data now
  covers the cases the report is built to surface, including work that slipped
  repeatedly and stayed late, and work that slipped but still got done.

## 1.19.1 — 2026-08-07

- **Fixed the macOS release build.** The pdf.js 6 upgrade in 1.19.0 brought in
  `@napi-rs/canvas`, a Node-side drawing library with prebuilt binaries that
  Ariadne never loads — the PDF viewer draws on the browser's own canvas. Its
  Apple-silicon binary was being copied into both halves of the universal Mac
  app, which the universal packager rejects, so the 1.19.0 Mac installers were
  never produced. The library is now excluded from the package. Linux and
  Windows builds were unaffected, and the app itself is unchanged.

## 1.19.0 — 2026-08-06

- **Now built on Node 24 and Electron 43.** Ariadne's toolchain had been held
  on Node 18, which reached end-of-life in April 2025 — as had Node 20, in
  April 2026. The floor is now Node 24 (supported until April 2028), which
  also lifts the cap that kept Electron at 39. Electron 43 brings four majors
  of Chromium security and rendering fixes. Nothing changes in the app's
  behaviour; PDF previews, image previews, and report PDF export were all
  re-verified against the new Chromium.
- **PDF rendering moves to pdf.js 6**, which had been held back by the same
  Node floor.

## 1.18.0 — 2026-08-06

- **Every report exports to PDF (D26).** A **PDF** button on the Reports
  screen prints whatever is on display — weekly status, portfolio roll-up,
  retrospective, at-risk or deferred — through Chromium's own print engine.
  The text stays real text, so the result is selectable and searchable, and
  the page is laid out for paper: white background, repeated table headers
  across pages, and rows that don't split down the middle. The export always
  matches the screen, current sort order included.
- **The portfolio roll-up exports to CSV (D27).** A **CSV** button next to it
  writes the table for a spreadsheet, with the next-due column as a real
  `YYYY-MM-DD` date rather than "in 3d" so it can be sorted and filtered.
- **Sortable portfolio columns (D27).** Every heading in the portfolio table
  is now clickable: the first click sorts by that column, a second reverses
  it. Counts start with the largest, names start at A. Projects with nothing
  scheduled stay at the bottom either way.
- Cleared the remaining npm advisories (`brace-expansion`, `fast-uri`,
  `postcss`, `tar`, `undici`, `dompurify`) — all build-time dependencies;
  `npm audit` reports zero.

## 1.17.0 — 2026-08-06

- **PDFs preview inline (D24).** Opening a PDF from the Files page or a
  project's Files & documents list now renders the document in the file
  viewer, with page-forward/back and zoom, instead of offering a download
  button. Ariadne draws the pages itself: Electron only hands PDFs to
  Chromium's built-in viewer for top-level navigations, so an embedded frame
  renders nothing no matter how it is configured. The renderer is bundled, so
  previews work with no network.
- **The whole week column opens the day (D25).** In the calendar's week view,
  clicking anywhere in a day — not just its date number — opens that day's
  task dialog. The number was a small target, and a day with nothing due had
  no clickable control at all. Task chips still open their own task.

## 1.16.0 — 2026-08-05

- **A real application menu (D22).** Ariadne now installs a proper
  Ariadne/File/Edit/View/Window/Help menu instead of Electron's default. On
  macOS the app menu carries About, Settings (⌘,), Services, Hide, and Quit;
  Window uses the native Minimize/Zoom/Bring All to Front roles; Help is
  tagged with the help role so macOS adds its search field. On Windows and
  Linux, Settings and Quit live in File instead. **View** leads with the
  places the app can take you — Command Center ⌘1, Calendar ⌘2, Reports ⌘3,
  Files ⌘4, Tags ⌘5, plus a Scope submenu — and the developer items (Reload,
  DevTools) only appear in a dev run.
- **macOS hidden-inset titlebar.** The traffic lights now float over the
  sidebar rather than sitting in a separate grey title strip, and the top bar
  is a window drag region.
- **Export / Import Archive (D22).** File → Export Archive… (⇧⌘E) writes a
  single `.zip` holding the workspace and every uploaded file as real files —
  far smaller than the JSON export, which inlines file bytes as base64, and
  openable with any zip tool. Import Archive… (⇧⌘I) restores one, after a
  confirmation. The JSON export/import stays for compatibility with older
  exports. Both are on the File menu and in Settings → Data.
- **About box.** Version, platform, Electron/Chromium/Node versions, and your
  data folder, with links to the GitHub repo, the issue tracker, and
  timhowland.com, plus a "Copy version details" button for bug reports.
- **Bundled help.** Help → Ariadne Help (⌘?) opens an in-app help window
  covering getting started, projects & tasks, the reports, and data &
  backups, with a keyboard-shortcuts table that shows the right modifier keys
  for your platform. It ships with the app, so it works offline and always
  matches the version you are running.
- **Drag-and-drop uploads.** The project's Files & documents card now has a
  drop zone: drag files from Finder or Explorer straight onto it, or click it
  to browse. Same handling as the Upload button — bytes are copied into your
  data folder.
- **New report: Deferred (D23).** Ariadne now records every time an open
  task's due date is pushed later, and the new report ranks the tasks you
  keep rescheduling. Pick a threshold (2/3/5/8 reschedules, default 3) and it
  lists the worst offenders with their history — first due date, current due
  date, days added, when it last moved — above analytics for the whole
  filter: total reschedules, days lost to churn, average days per push,
  median pushes per task, how many are still open and overdue, how many got
  done anyway, and breakdowns by project and by priority. Pulling a date in,
  setting a due date for the first time, and rescheduling finished work are
  not counted. Copy report works like every other report.

## 1.15.0 — 2026-08-03

- **Reschedule every overdue task at once.** The Command Center's Overdue card
  has a "Reschedule for today" button that moves the whole list onto today's
  date. It respects the Work/Home scope you are in, and confirms first, since
  it rewrites a lot of due dates and there is no undo.
- **Right-click a project in the sidebar.** Open it, archive or restore it,
  move all of its tasks into another project, reschedule just its overdue
  tasks, add a task, or delete it. Works on archived projects too, where the
  archive item becomes "Restore from archive".
- **Right-click any task, anywhere.** Set it due today, tomorrow, or next week,
  clear the due date, mark it complete (or reopen it), drop it, move it to
  another project, jump to its project, or delete it. The same menu is on task
  rows in the Command Center, project pages, search results, the calendar, and
  the day view.
- **New "Move tasks to project" dialog** behind both menus. Moving a whole
  project's tasks keeps their dependency chains intact; moving a single task
  out of a chain drops the links that would otherwise point across projects.
  Attached files follow their task. Archived projects are never offered as a
  destination.
- Menus close on Escape, on scroll, and on a click elsewhere; the keyboard
  drives them with the arrow keys, and a destructive item is never the one
  focused first. Everything the menus do is still reachable the ordinary way.

## 1.14.0 — 2026-07-31

- **Archived projects count in the retrospective (D19).** Work you finished
  before parking a project no longer vanishes from the retrospective when you
  archive it — completions in the date range are included, and the group
  header is labelled "archived" so it's clear why a parked project is listed.
  Every other report (weekly status, portfolio roll-up, at-risk) still leaves
  archived projects out, and work/home scoping is unchanged.
- **Arrangeable dependency map (D20).** Drag the nodes on a project's
  dependency map into an arrangement that reads well; the connecting lines
  rubber-band as you go and re-anchor to whichever sides of the boxes face
  each other, so chains stop crossing over themselves. Positions are saved
  per project, a drag handle under the map grows or shrinks the card (arrow
  keys work too), and "Reset layout" in the card header puts everything back
  on the automatic layers. Clicking a node still opens the task editor.

## 1.13.0 — 2026-07-21

- **Opt-in debug logging (D18).** A new Settings card turns on a plain-text
  activity log for tracking down problems: your edits and navigation, backup
  runs and pruning, Todoist push/sync attempts and failures, disk-save
  failures and write-guard rejections, imports/exports, AI extraction, and
  app start/quit — each line timestamped and category-tagged. Off by default;
  the log goes to `ariadne-debug.log` in the app's logs folder (next to
  `main.log`) or any folder you pick, rotates at 5 MB, and never leaves your
  machine. A "Show log file" button reveals it in the Finder/file manager.

## 1.12.0 — 2026-07-19

- **Filter box on the Tags manage list.** Type to narrow the management rows
  (case-insensitive substring, a leading `#` is fine); the card header shows
  the matching count and the search cloud above stays complete. Built for
  workspaces that have accumulated dozens of tags.

## 1.11.0 — 2026-07-19

- **Tag management lives on the Tags page now.** Rename (renaming onto an
  existing tag still merges after a confirm) and delete moved from Settings
  into the top-level **Tags** view, under the click-to-search cloud. The
  Settings screen loses its ever-growing tag list, so Backups, Todoist, and
  the other cards are reachable without scrolling past it.

## 1.10.0 — 2026-07-18

- **Todoist completion sync replaces the import.** Ariadne no longer pulls
  every active Todoist task into a "Todoist Inbox". Instead it watches the
  tasks you've _sent_ to Todoist (the `todoist:<id>` note markers) and, when
  you complete one in Todoist, marks it Done here with Todoist's completion
  date. Open tasks only — nothing is created, deleted, or un-dropped; the
  sync looks at the last 30 days of completions and is safe to run again.
- **Sync schedule setting.** The Settings → Todoist card gains a "Sync now"
  button and a schedule: run the check manually, every hour, or once a day
  (checked once a minute while the app is open; the last-attempt time shows
  under the card). Scheduled runs stay quiet unless they actually complete
  something.
- Existing "Todoist Inbox" projects and their tasks are untouched — they
  keep syncing completions too, and still never push back.

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
