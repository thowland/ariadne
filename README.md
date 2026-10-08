# Ariadne

Ariadne is a single-user, local-first project and task tracker, built as an
Electron desktop application (React 18 + TypeScript + Vite, via electron-vite).
The name is the thread out of the labyrinth — the line you follow through work
that runs longer than your memory of it does.

Everything you enter lives on your own filesystem as human-readable JSON plus
ordinary files for attachments. There is no account, no login, no server, and no
database, which means the app keeps working when the network doesn't, and your
data outlives the application: if Ariadne disappeared tomorrow, the JSON is still
readable in any text editor and the attachments are still files in a folder.

**Current release: v2.4.0.** `CHANGELOG.md` records what shipped when.

<!-- prettier-ignore -->
![The Command Center: stat cards, an overdue banner, focus sections, and the portfolio column](docs/screenshots/command-center.png)

## Screens and behavior

Every screenshot below comes from the sample workspace the app seeds on first
run, so you can reproduce all of it by launching a fresh copy. Regenerate them
with `npm run screenshots` (see [Screenshots](#screenshots)).

|                                                                                                                                             |                                                                                                                                     |
| ------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| [![Project detail with the dependency map](docs/screenshots/project-detail.png)](docs/screenshots/project-detail.png)                       | [![The task editor](docs/screenshots/task-editor.png)](docs/screenshots/task-editor.png)                                            |
| **Project and dependency map** — tasks, notes, links, tags, and files on one screen, over a draggable graph of the project's task chains.   | **Task editor** — status, priority, due date, subtasks, "Blocked by" dependencies, attachments, links, and a one-task Todoist push. |
| [![The calendar month view](docs/screenshots/calendar.png)](docs/screenshots/calendar.png)                                                  | [![The weekly status report](docs/screenshots/reports.png)](docs/screenshots/reports.png)                                           |
| **Calendar** — a month grid or a single Sun–Sat week, with priority-colored chips and an Upcoming list.                                     | **Weekly status** — done / planned / at-risk per project, scoped to Work, Home, or a tag, and copyable as plain text.               |
| [![The retrospective report](docs/screenshots/retrospective.png)](docs/screenshots/retrospective.png)                                       | [![The cross-project files library](docs/screenshots/files.png)](docs/screenshots/files.png)                                        |
| **Retrospective** — what actually got finished over a date range, with completions over time; archived projects still count.                | **Files library** — every attachment across every project in one place.                                                             |
| [![The contacts list](docs/screenshots/contacts.png)](docs/screenshots/contacts.png)                                                        | [![A contact's detail page](docs/screenshots/contact-detail.png)](docs/screenshots/contact-detail.png)                              |
| **Contacts** — everyone you work with, sortable by load, company, or last activity, with one-click copy for a name, email, or number.       | **Contact detail** — their details, plus every task and project they touch, each one a click from the work itself.                  |
| [![Reporting lines on a contact](docs/screenshots/contact-detail-org.png)](docs/screenshots/contact-detail-org.png)                         | [![Reviewing a CSV import](docs/screenshots/contact-import.png)](docs/screenshots/contact-import.png)                               |
| **Org links** — who they report to and who reports to them, plus an envelope and handset that hand the address to your mail app or dialer.  | **CSV import** — reviewed before anything is written: what is new, who gets updated, and which rows could not be used.              |
| [![Linking a person to a task with @](docs/screenshots/task-mentions.png)](docs/screenshots/task-mentions.png)                              | [![The contact activity report](docs/screenshots/contact-activity.png)](docs/screenshots/contact-activity.png)                      |
| **@-mentions** — type `@` and a few letters in a task title; the name completes in place, and somebody new is held until the task is added. | **Contact activity** — who you have actually been working with over a date range, ranked, with the organizations behind them.       |
| [![Tagging a task with #](docs/screenshots/task-tags.png)](docs/screenshots/task-tags.png)                                                  | [![Rescheduling a whole day](docs/screenshots/day-reschedule.png)](docs/screenshots/day-reschedule.png)                             |
| **#-tags** — type `#` in a task title and pick from the vocabulary, or coin a new one; the word comes back out once the tag is stored.      | **Reschedule a day** — a holiday or a sick day moves every open task due that day onto a new date in one step.                      |
| [![The tags view](docs/screenshots/tags.png)](docs/screenshots/tags.png)                                                                    | [![Settings](docs/screenshots/settings.png)](docs/screenshots/settings.png)                                                         |
| **Tags** — every tag with usage counts, plus rename, merge, and delete across the whole workspace.                                          | **Settings** — the data folder, backups and retention, JSON export/import, and the Todoist and Claude integrations.                 |

- **Command Center** — the daily review. Stat cards, an overdue banner, and focus
  sections (Overdue, Due today, Due this week, High priority · later, Blocked),
  alongside a portfolio column where each project card carries a
  status-composition strip, a weekly-completions sparkline, a current-week
  due-load strip, and next-due labels. "This week" means the current Sun–Sat
  calendar week (decision D15) rather than a rolling seven days, so a task due
  next Monday waits in "High priority · later" until its week actually starts.
- **Projects and tasks** — a per-project workspace (notes, links, tags, quick-add
  task list) and a full task editor covering status, priority, due date,
  subtasks, "Blocked by" dependencies, attachments, and links. Everything
  auto-saves; there is no Save button anywhere in the app. Finished projects can
  be archived, either by the checkbox on the project screen or by dragging the
  project onto the sidebar's archive zone, at which point they leave every active
  surface but stay intact under the sidebar's ARCHIVED section. The sidebar
  project list can be split into groups with **dividers** (decision D42): drag
  the divider at the foot of the sidebar onto a project and a group header
  appears above it, asking for a name. The header's twisty folds the group
  away the way the ARCHIVED section does (D50); drag a header elsewhere to move
  it, or off the list to remove it. A divider, its name and its fold state are
  stored against the project it sits above, so reordering the list keeps the
  groups intact.
- **Dependency map** — a layered SVG graph of each project's task chains. Drop
  one box onto another to declare that the dragged task waits on it (decision
  D37), and right-click a line to remove a dependency. The automatic layering
  is a starting point: drag any node where you want it and
  the edges rubber-band along, re-anchoring to whichever sides of the boxes face
  each other, so a graph whose lines cross can be pulled into something readable.
  The arrangement is saved per project, the strip under the canvas resizes the
  card, and "Reset layout" returns everything to the computed rows.
- **Calendar** — a month grid or a single Sun–Sat week, with priority-colored
  chips, a single-day drill-in modal, and an Upcoming list. The day view carries
  a bulk **Reschedule all…** (decision D41), which moves every _open_ task due
  that day onto a new date — what a holiday or a sick day actually needs.
  Finished tasks stay where they are; they happened when they happened.
- **Document library** — per-project markdown notes with a sanitized live
  preview, file uploads (PDFs, CSVs, and images preview inline), task
  attachments, and a cross-project **Files** view that lists everything in one
  place.
- **Appearance** (decision D38) — light, dark, or whatever the operating system
  is doing, which is the default. Every colour in the app is a design token
  with both values, so the whole thing re-themes at once; exported report PDFs
  stay black-on-white regardless.
- **Tagging as you type** (decision D40) — typing `#` in a task title opens a
  tag picker built the same way the `@` people picker is: anchored so `C#` and
  `issue#42` are left alone, a bare `#` listing the whole vocabulary, and the
  picked tag completing in place as you type. The word then comes back out of
  the title when the task is committed, the way an accepted date phrase does
  (decision D35) — the tag itself is the single copy. A word nobody picked is
  prose, and stays exactly as typed. A tag nobody has used yet is offered on
  the last row, because the vocabulary is free-form. Tags are
  masked out of the text before the natural-language date scanner reads it, so
  `#sat` and `#mar` never set a due date nobody asked for.
- **Effort estimates** (decision D36) — an optional estimate per task in days
  and hours, counted as _effort_ rather than calendar time. A project's header
  shows what is left, and the portfolio roll-up totals it in a sortable column
  that exports to CSV.
- **Reports** — weekly status with done/planned/at-risk count pills, a portfolio
  roll-up with progress bars, a date-ranged retrospective with range presets and
  a completions-over-time chart, and an at-risk report. All of them filter by
  Work/Home/tag, and a work-scoped report can never leak a personal project,
  which is the property that makes the weekly status safe to paste into a work
  channel. Archived projects drop out of every report except the retrospective,
  which looks backwards and so still credits work finished before the project
  was parked (decision D19). A **deferred** report ranks the tasks whose due
  date keeps sliding by reschedule count, with churn analytics, so chronic
  slippage is visible rather than buried (decision D23). A **contact activity**
  report ranks the people you have worked with over a date range, with the
  organizations behind them (decision D31). Every report copies out as plain
  text, and exports to PDF — where the click-to-copy buttons print the address
  or number they would have copied, since paper has no clipboard.
- **Right-click accelerators** — a context menu on every task row (due today /
  tomorrow / next week, clear the date, complete, drop, move to another
  project, delete) and on every sidebar project (archive or restore, move all
  its tasks, reschedule its overdue, add a task, delete). Plus a
  "Reschedule for today" button on the Command Center's Overdue card that
  clears the whole backlog onto today in one go. None of it is the only route
  to anything: the menus are shortcuts over actions the ordinary UI already
  has, so the surface stays discoverable for everyone else.
- **Contacts** (decision D31) — the people behind the work. A contact carries a
  name, company, role, email, phone, notes, and tags; a task can be linked to
  any number of them by typing `@` and a few letters of a name, which completes
  to their full name in place — the name stays in the title, the way a D29 date
  phrase does — and offers to create the person on the spot if they are new.
  That offer has to be taken deliberately: Enter on a name matching nobody adds
  the task, and a person named in the quick-add box is only written to the
  address book once the task itself is, so a typo never leaves a stray contact
  behind. Every project
  grows a **Contacts** card listing the people attached to the project itself
  _plus_ everyone on one of its tasks, each expandable to click-to-copy details.
  A **Contacts** screen sorts the whole address book by open load, company, or
  last activity; a contact's own page holds their details beside every task and
  project they touch. Search covers them — including a phone number typed
  without its punctuation — and the **Contact activity** report ranks who you
  have been working with over a date range. Nothing syncs with the OS address
  book: this is the enterprise-shaped half of your contacts, kept where the work
  is.
- **Tags** — prefix autocomplete everywhere, click-to-search, and a **Tags** view
  listing every tag with usage counts plus rename, merge, and delete management.
- **Todoist** — push upcoming tasks into #Home or #Work with @project labels
  (either in bulk from Settings or one task from its editor), plus a completion
  sync that marks a pushed task Done here once you complete it in Todoist,
  running manually, hourly, or daily.
- **Data ownership** — a configurable data folder, daily and on-quit backups with
  retention, **zip archive export and import** (the workspace plus every uploaded
  file in one file, openable with any zip tool), legacy JSON export and import,
  atomic writes, and recovery from a corrupt file by quarantining it and
  restoring from the newest backup.
- **Native menus and help** — a real application menu (decision D22): the macOS
  app menu carries About, Settings, Services, Hide, and Quit under a
  hidden-inset titlebar, while Windows and Linux put Settings and Quit under
  File. There is an About box with version and runtime details, and bundled
  offline help with a platform-correct keyboard-shortcut table. Files can be
  added by dragging them onto the library.

## Asking Claude about your workspace

Ariadne ships a **read-only MCP server** (decision D39) so a local Claude can
answer questions about your own projects, tasks and people — "what's overdue",
"what did I ask Dana for", "write my standup". It is a single dependency-free
file that Claude spawns on demand; there is no port, no daemon and no network.

```sh
npm run build          # produces out/mcp/server.mjs
npm run install:skill  # links the skill and prints the registration command
```

The skill lives in `skills/ariadne/` and is symlinked into `~/.claude/skills`,
so it works in any session rather than only inside this checkout.
**`docs/CLAUDE_MCP.md`** is the full guide — setup for both Claude Code and
Claude Desktop, the five tools, and what to check when it misbehaves.

It cannot change anything, on purpose. The running app holds the workspace in
memory and rewrites the JSON on its next save, so an outside writer would be
silently overwritten; a write path needs the app to watch its data directory
first. `settings.json` is never read at all, because it holds your API tokens
in plain text.

## Installing a release

If you want to run Ariadne rather than work on it, take the installer for your
platform from the [Releases page](https://github.com/thowland/ariadne/releases)
and read `docs/DISTRIBUTION_README.md`, which is the end-user guide and ships
inside the packages.

The builds are unsigned, so both Windows and macOS will object on first launch.
On Windows, SmartScreen shows "Windows protected your PC" and you get past it
with **More info → Run anyway**. On macOS 15 or later, launch it once, dismiss
the warning, then go to **System Settings → Privacy & Security** and click **Open
Anyway**; on macOS 14 and earlier, right-click the app and choose **Open**. Code
signing costs $99 a year per platform, and for a project distributed to friends
and family that is a poor trade against a one-time click.

## Getting started as a developer

Requires Node ≥ 24 (`engines` in `package.json`; CI and the release builds use
24.x). Node 18 and 20 both reached end-of-life — April 2025 and April 2026 —
and much of the tool chain had already moved past them.

Two consequences of Node 24 worth knowing before your first install: npm 11
blocks dependency install scripts unless they are approved in `package.json`'s
`allowScripts` block, and Electron 43 ships no install script at all, so the
project's own `postinstall` fetches its binary explicitly.

```sh
npm ci          # fresh install; read "Shared folders" below before reusing a checkout
npm run dev     # launch the app with hot reload
```

On a headless machine, anything that opens a window needs a display server:
prefix the command with `xvfb-run -a`.

## Quality pipeline

Every change lands through the same gate. These are requirements rather than
suggestions, and the reason is that the domain layer described below is only
cheap to refactor for as long as its tests actually cover it.

```sh
npm test                 # full unit/integration suite (Vitest)
npx vitest run <path>    # a single test file
npx vitest -t "pattern"  # tests matching a name
npm run test:coverage    # coverage with ENFORCED >=80% global thresholds
npm run test:e2e         # Playwright driving the built Electron app
npm run lint             # ESLint over the whole repo (lint:fix to autofix)
npm run format:check     # Prettier (format to write)
npm run typecheck        # tsc project checks (node + web)
npm run verify           # typecheck + lint + format + coverage — run before committing
```

Coverage thresholds live in `vitest.config.ts` and are never lowered; an obsolete
test is deleted rather than skipped, because a skipped test is a coverage claim
nobody is checking. E2E runs use a throwaway data directory and pin the date
through `ARIADNE_FAKE_TODAY`, since the seed dataset assumes `2026-07-08`.

## Screenshots

The images in this README are generated, not hand-captured, so a UI change can't
quietly leave them stale:

```sh
npm run screenshots      # xvfb-run -a npm run screenshots on a headless machine
```

`scripts/screenshots.mjs` drives the built app through Playwright and writes
`docs/screenshots/*.png`. It borrows the E2E determinism trick — a throwaway user
data directory so each shot starts from the freshly seeded sample workspace, and
`ARIADNE_FAKE_TODAY=2026-07-08` so the counts, the calendar grid, and the
retrospective range are identical every run. Adding a shot means adding one entry
to the `SHOTS` array with the clicks that reach that screen. Regenerate whenever
a change alters one of the pictured screens, and check the diff — a screenshot
that changed for reasons you can't explain is a bug report.

## Architecture

Three strictly isolated Electron layers:

```
┌──────────────────────────────────────────────────────────────────┐
│ MAIN (Node)      src/main/                                       │
│   index.ts       bootstrap, window, ariadne-blob:// protocol,    │
│                  single-instance lock, backup scheduling, menu   │
│   menu.ts        application-menu template (pure; type-only      │
│                  electron import, so it is unit-tested)          │
│   ipc.ts         ipcMain.handle registrations → services (glue)  │
│   quick-add-tray.ts  menu-bar icon + quick-add flyout window     │
│                  (D51); it holds no data of its own              │
│   services/      Config, Storage, Blob, Backup, ImportExport,    │
│                  Archive (zip), Todoist (+push), Logger,         │
│                  DebugLog — unit-tested against real temp dirs   │
│                  / mocked HTTP                                   │
├──────────────────────────────────────────────────────────────────┤
│ PRELOAD          src/preload/index.ts                            │
│   exposes window.ariadne implementing AriadneApi                 │
│   (typed in src/shared/ipc-contract.ts) — nothing else leaks     │
├──────────────────────────────────────────────────────────────────┤
│ RENDERER (React) src/renderer/                                   │
│   app/store.ts   Zustand store: data slice + ui slice            │
│   app/menu-commands.ts + workspace-io.ts — menu dispatch and     │
│                  the import/export flows the buttons share       │
│   views/ modals/ components/ — thin shells over shared/          │
└──────────────────────────────────────────────────────────────────┘
```

The load-bearing rule is that all domain behavior lives in `src/shared/` as pure,
synchronous, dependency-free TypeScript, with no Electron, DOM, or fs imports.
Main services and React components stay thin over it. Pure functions test without
a window, a filesystem, or a clock, which is what makes an 80% coverage gate
affordable rather than a tax, and it is why a change to how "blocked" is derived
touches one file and one test file instead of a view, a service, and three mocks.

Data flows one way, and every edit saves itself:

```
user edit → store.apply(pure mutation from shared/domain/mutate.ts)
          → Zustand data slice updates (renderer is authoritative in memory)
          → changed collections sent over IPC
          → StorageService debounces (~300ms) and writes atomically
            (write .tmp → rename) to JSON in the data directory
```

On disk, at a location shown under **Settings → Data** and changeable there:

```
<dataDir>/
  workspace.json                # { schemaVersion }
  projects.json  tasks.json  files.json  contacts.json  settings.json
  blobs/<fileId>.<ext>          # uploaded files (served via ariadne-blob://)
  backups/<YYYY-MM-DD>/         # daily + on-quit whole-workspace backups
```

### Module map

| Where                             | What                                                                                                                                                                 |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/shared/types.ts`             | Entities (Project, Task, FileEntry, Contact, Settings, Workspace), enums, constants                                                                                  |
| `src/shared/schema/`              | zod validation, referential-integrity normalization, import migration, the save write-guard                                                                          |
| `src/shared/domain/mutate.ts`     | The complete mutation command surface — every state change goes through here                                                                                         |
| `src/shared/domain/derive.ts`     | Derived values: blocked, overdue, due windows, progress, relative labels, scope                                                                                      |
| `src/shared/domain/*.ts`          | reports, calendar, contacts (D31), dep-graph, search, sort, tags, quick-add (D51), vcard (D49), todoist (push+completion sync), ai-import, csv, seed                 |
| `src/shared/ipc-contract.ts`      | Channel names + request/response types + the `AriadneApi` bridge interface                                                                                           |
| `src/main/services/`              | Filesystem, backups, blobs, import/export, zip archives (D22), Todoist HTTP, Claude extraction, debug log (D18) — `.test.ts` twins                                   |
| `src/main/menu.ts`                | Application-menu template; data actions become `MenuCommand`s the renderer dispatches (D22)                                                                          |
| `src/main/quick-add-tray.ts`      | Menu-bar icon and its flyout (D51); the flyout is the renderer bundle at `#quick-add`, and its tasks are created by the main window via `commitQuickAdd`             |
| `src/renderer/app/store.ts`       | `apply(mutation)` pattern + ui state (view, modal back-stack, scope, search, toast)                                                                                  |
| `src/renderer/views/` + `modals/` | CommandCenter, ProjectDetail, Calendar, Reports, Contacts, ContactDetail, FilesLibrary, TagsView, Settings, SearchResults; Task/File/Day/MoveTasks/About/Help modals |
| `src/mcp/`                        | Read-only MCP server (D39): workspace locator, loader, tool projections, hand-rolled stdio protocol                                                                  |
| `e2e/app.spec.ts`                 | Playwright flows: seed, CRUD, persistence-across-restart, library, reports, backups, tags, contacts, debug log                                                       |

## Adding a feature

Work domain-first. The order below is what keeps the gates green, because each
step only depends on layers that are already tested.

1. **Domain** — add pure logic to `src/shared/domain/`, either a new module or
   new mutations in `mutate.ts` returning `{ workspace, changed }` with
   structural sharing. Write its tests alongside; this layer should land near
   100% covered. If the change persists new data, extend `types.ts` and the zod
   schemas in `shared/schema/workspace-schema.ts`, using `.catch()` defaults so
   that an existing workspace written by an older build still loads without a
   migration step.
2. **Main service**, only if the feature touches disk, network, or the OS — add a
   service class in `src/main/services/` with injectable dependencies (fetch,
   sleep, clock, temp dirs) and test it against real temp directories or mocked
   HTTP.
3. **IPC** — a new channel touches four places: the channel name, types, and
   `AriadneApi` method in `shared/ipc-contract.ts`; the handler registration in
   `src/main/ipc.ts`; the mirror in `src/preload/index.ts`; and the API mocks in
   both `src/renderer/test-utils.tsx` and `src/renderer/app/store.test.ts`.
   Typecheck fails until the mocks match, which is the intended nag.
4. **UI** — views and components call `store.apply(mutation)` and `getApi()`, and
   carry no business logic. Reuse `Card`, `TaskRow`, `SegmentedControl`, and
   `ConfirmDialog`; destructive actions always confirm through `askConfirm`
   rather than `window.confirm`, and the confirm dialog never autofocuses its
   destructive button.
5. **Tests at each layer you touched**, then an E2E flow in `e2e/app.spec.ts` if
   the feature spans process boundaries or has to survive a restart.
6. **Gate**: `npm run format && npm run verify && xvfb-run -a npm run test:e2e`,
   update `CHANGELOG.md`, bump the version for user-visible features, commit, and
   tag.

Two commits are worked examples of exactly this layering: `[v1.1.0]` (backups —
setting, service, IPC, Settings UI, E2E) and `[v1.3.0]` (Todoist push — domain
candidates, HTTP service, IPC, UI preview).

Gotchas that bite:

- `today` is always a parameter, and only shells call `todayIso()` from
  `shared/domain/clock.ts`. Never ask for "now" inside `shared/`, or the tests
  start depending on the day you run them.
- A mutation that removes files must surface `removedBlobIds`, and its caller has
  to invoke `api.deleteBlobs(...)`; blob bytes are not cleaned up on their own.
- The task status cycle is `Todo → Doing → Waiting → Done → Todo`, with `Dropped`
  reachable only through the select, so that a stray click can't drop a task.
  `completedAt` is non-null if and only if the task is Done, enforced in the
  mutation layer.
- "Blocked" is derived and never stored, and dependency cycles are tolerated
  rather than rejected, so any graph traversal has to be visited-set safe.
- Renderer saves are screened by `shared/schema/write-guard.ts` and
  `StorageService.savePayload`: a schema gate plus a tripwire that refuses to
  overwrite a populated collection with an empty list. A new mutation that
  legitimately wipes collections has to set `replaceAll: true` on its
  `MutationResult`, following `clearAll` and `replaceWorkspace`, or its saves get
  rejected.
- Modal state is a back-stack (`day → task → file`), opened and closed through
  the store.
- Don't put `.trow`, which is a flex style, on a table row; tables use
  `.portfolio-row`.

## Integrations

Both integrations are optional, off until you supply a credential, and are the
only times the app talks to the network.

**Todoist** uses the unified API v1 (`api.todoist.com/api/v1/…`); REST v2 is
retired upstream and answers 410 for everyone. The client sends a User-Agent,
paginates with cursors, retries transient failures with backoff that honors
`retry_after`, and makes creates idempotent through `X-Request-Id`. Both
directions key on a `todoist:<id>` marker line in the task notes, which is what
lets a push dedupe and a completion sync join back to the right task. Since
v1.10 there is no Todoist→Ariadne task creation; the sync only marks tasks Done
(decision D17). `src/main/services/todoist-service.ts` is the only file that
speaks HTTP to Todoist, so a change in Todoist's error shapes is a one-file
problem.

**AI task import** (D12) calls the Anthropic API through the official
`@anthropic-ai/sdk` from the main process only, in
`src/main/services/ai-extract-service.ts`, using model `claude-sonnet-5` with
structured outputs pinning the response to a JSON schema.
`shared/domain/ai-import.ts` re-validates the result leniently through
`parseExtraction`, maps project hints, and creates the tasks you confirm, filing
unmapped ones under an on-demand `AI Imported` placeholder project. Service tests
inject a fake `fetch` into the real SDK client (`{ fetch, maxRetries: 0 }`) so
the production request and error paths are exercised offline.

Both credentials are stored in plain text in `settings.json`, by decision D10.
The rationale is that the file lives in your own data directory on a single-user
machine, and encrypting it with the OS keychain would make `settings.json`
non-portable across machines and break the export/import round-trip that the
whole data-ownership story rests on. Treat that file the way you treat a password
file, and be aware of the tradeoff rather than surprised by it.

## Packaging

```sh
npm run package:linux          # AppImage + deb (run on Linux) → release/
npm run package:mac            # DMG + zip for this Mac's architecture (run on macOS)
npm run package:mac:universal  # single DMG for Apple Silicon + Intel
npm run package:win            # Windows x64 NSIS installer (cross-built on Linux) → release/
```

macOS packages have to be built on a Mac, because the DMG and signing steps need
Apple tooling. Notarization is off (`build.mac.notarize: false`) and signing is
pinned to ad-hoc (`"identity": "-"` with `hardenedRuntime: false`). That pin is
deliberate: letting electron-builder auto-discover a keychain certificate is what
used to hang the build, because `codesign` blocks silently waiting on a keychain
permission dialog, and a Development certificate buys nothing for distribution
anyway. `npm overrides` pins `@noble/hashes` to 1.x for electron-builder; keep it
when updating dependencies.

The Windows installer cross-builds on Linux, including on an arm64 VM, but that
path needs the system NSIS (`sudo apt-get install nsis`) plus two shims wired up
by `scripts/package-win.sh`: an `ELECTRON_BUILDER_NSIS_DIR` toolchain directory
in `scripts/nsis-linux-arm64/` (see its README) and a patched `app-builder-lib`
in `patches/`, applied by the `postinstall` hook, that extracts the uninstaller
in pure JS instead of running the installer under wine. The installer is
unsigned, installs per-user, and keeps data in `%APPDATA%\Ariadne`.

`docs/DISTRIBUTION_README.md` is the end-user guide that ships with the packages:
the DMG embeds it as `README.txt` through `build.dmg.contents`, and `package:win`
copies it to `release/README.txt` to send alongside the installer. The mac zip
target can't carry extra files, so add it by hand if you distribute that way.
Keep the guide in step with user-visible behavior changes to backups,
integrations, and data paths.

### Notarizing, if it ever becomes worth it

To distribute DMGs without the Gatekeeper friction, all of this happens on the
Mac:

1. Join the Apple Developer Program at developer.apple.com, $99/yr. The Team ID
   will match the suffix of the existing certificate identity.
2. Create a **Developer ID Application** certificate (Xcode → Settings →
   Accounts → Manage Certificates → "+") so that it lands in the keychain, where
   electron-builder picks it over a Development certificate.
3. Create an app-specific password at account.apple.com → Sign-In & Security →
   App-Specific Passwords.
4. In `package.json` under `build.mac`, set `"notarize": true`, set
   `"hardenedRuntime": true` (notarization requires it, and electron-builder
   applies Electron's JIT entitlements automatically), and remove the
   `"identity": "-"` pin so that electron-builder auto-discovers the Developer ID
   certificate. Expect one keychain prompt on the first signing run; click
   "Always Allow" so later builds don't block on it.
5. Package with the credentials in the environment:

   ```sh
   export APPLE_ID="<apple id email>"
   export APPLE_APP_SPECIFIC_PASSWORD="xxxx-xxxx-xxxx-xxxx"
   export APPLE_TEAM_ID="<team id>"
   npm run package:mac
   ```

   electron-builder signs with the Developer ID certificate, submits to Apple's
   notary service — the first run can take several minutes — and staples the
   ticket. Verify with `spctl -a -vv release/mac-arm64/Ariadne.app`.

### Shared folders

`node_modules/` holds platform-specific binaries, including the Electron runtime
and rollup's native module. If this repository lives in a folder shared between a
Linux VM and a Mac, use a separate clone per OS, because an install run on one
side swaps the binaries out from under the other. If a cross-OS install clobbers
a checkout anyway, `node node_modules/electron/install.js` restores the Electron
binary and `npm i --no-save @rollup/rollup-<platform>` restores rollup's native
module. Never assume `node_modules` is healthy after a failed launch; check
`node_modules/electron/dist` first.

## Releasing

1. `npm run format && npm run verify && xvfb-run -a npm run test:e2e` — all green.
2. Update `CHANGELOG.md` and bump `version` in `package.json`.
3. Commit, push the branch, then `npm run release:tag`. It tags the version in
   `package.json` and pushes the tag, which is what the
   `.github/workflows/release.yml` workflow triggers on: it builds the Linux,
   macOS, and Windows packages and attaches them to a draft GitHub release,
   which you then review and publish.

`npm run release:tag -- --dry-run` prints the plan without touching anything,
and `--remote=X` overrides the auto-detected remote (`github` here, `origin` in
a plain clone; `vmshare` is refused outright). The preflight refuses a dirty
tree, a version with no `CHANGELOG.md` section, a commit that isn't on the
remote branch, and — the one that matters — a tag that already exists on the
remote. Published tags are immutable: somebody has that installer, so cut the
next version rather than repointing it.

Fixes ship as plain commits; features get a `[vX.Y.0]` commit and a tag.

## Contributing

This is a personal project maintained in whatever time is available, so please
open an issue before writing a large patch — an unreviewable pull request that
took someone a weekend is a worse outcome than a five-minute conversation.
`CONTRIBUTING.md` covers the details, and the short version is that the quality
gate above applies to contributions exactly as it applies to me.

## License

Ariadne is free software under the **GNU General Public License, version 3 or
later**. You may use, study, modify, and redistribute it, and if you distribute a
modified version you have to offer the source under the same terms. The full text
is in `LICENSE`, and there is no warranty; see sections 15 and 16.

## Documentation map

- `docs/TECHNICAL_SPEC.md` — object model, services, architecture, and the
  decision table D1–D42. Record any deliberate behavior change as a new row
  there, because that table is what explains why the code disagrees with the
  prototype.
- `docs/DISTRIBUTION_README.md` — the end-user guide that ships in the packages.
- `docs/CLAUDE_MCP.md` — setting up the read-only MCP server in Claude Code and
  Claude Desktop, what the five tools return, and why there is no write path.
- `docs/CODE_REVIEW_2026-07-18.md` — a standing best-practices review. The P1
  robustness items are done and annotated inline; the remaining P2–P4 sections
  are agreed future work, so read it before starting a refactor in those areas.
- `docs/IMPLEMENTATION_PLAN.md` — the original nine-sprint delivery plan and its
  exit gates. History now, though the gates still apply to every change.
- `design/` — the design handoff: `README.md` holds design tokens and screen
  specs, `Throughline.dc.html` is the annotated prototype the app was built from,
  and `Ariadne.html` is the runnable prototype (login `admin`/`admin`, removed
  from the real app by decision D1).
- `docs/screenshots/` — the README images, generated by `npm run screenshots`
  rather than captured by hand. Regenerate them when a pictured screen changes.
- `CHANGELOG.md` — user-facing history per release.
- `CLAUDE.md` — working notes for AI-assisted maintenance.
