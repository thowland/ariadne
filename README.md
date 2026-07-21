# Ariadne

A single-user, local-first personal project & task tracker, built as an Electron
desktop application (React 18 + TypeScript + Vite via electron-vite). _Ariadne's
thread_ — the line that guides you through the labyrinth of long-running work.

All data lives on your local filesystem as human-readable JSON plus ordinary files
for attachments. No accounts, no cloud, no database, no login.

**Current release: v1.12.0** — see `CHANGELOG.md` for what shipped when.

## What it does

- **Command Center** — a daily review: stat cards, an ambient overdue banner, focus
  sections (Overdue, Due today, Due this week, High priority · later, Blocked), and a
  portfolio column where each project card shows a status-composition strip, a
  weekly-completions sparkline, a current-week due-load strip, and next-due labels.
  "This week" means the current Sun–Sat calendar week (D15), not a rolling 7 days.
- **Projects & tasks** — per-project workspace (notes, links, tags, quick-add task
  list) and a full task editor: status/priority/due, subtasks, "Blocked by"
  dependencies, attachments, links. Everything auto-saves; there is no Save button.
  Finished projects can be **archived** (checkbox on the project screen, or drag one
  onto the sidebar's archive zone): they leave every active surface but stay intact
  under the sidebar's ARCHIVED section.
- **Dependency map** — a layered SVG graph of each project's task chains.
- **Calendar** — month grid or single-week (Sun–Sat) layout, priority-colored chips,
  a single-day drill-in modal, and an Upcoming list.
- **Document library** — per-project markdown notes (sanitized live preview/edit),
  file uploads (PDF/CSV/images preview inline), task attachments, and a cross-project
  **Files** view that lists everything in one place.
- **Reports** — weekly status (with done/planned/at-risk count pills), portfolio
  roll-up (with progress bars), date-ranged retrospective (range presets + a
  completions-over-time chart), and at-risk — all filterable by Work/Home/tag
  (work reports can never leak personal projects) and copyable as plain text.
- **Tags** — prefix autocomplete everywhere, click-to-search, and a **Tags** view
  showing every tag with usage counts plus rename / merge / delete management.
- **Todoist** — push upcoming tasks (the primary direction: into #Home/#Work with
  @project labels, or a single task from its editor) and a completion sync that
  marks pushed tasks Done here when you complete them in Todoist (manual, hourly,
  or daily).
- **Data ownership** — configurable data folder, daily + on-quit backups with
  retention, JSON export/import (accepts the original design-prototype exports),
  atomic writes with corrupt-file recovery.

## Getting started

Requires Node ≥ 18.18. This repo pins tool majors that still support Node 18
(Vite 6, Vitest 3, ESLint 9, electron-vite 3) — don't bump those without checking
engine ranges.

```sh
npm ci          # fresh install (see "Shared folders" below before reusing a checkout)
npm run dev     # launch the app with hot reload
```

On a headless machine, anything that opens the app needs a display server:
`xvfb-run -a <command>`.

## Quality pipeline

Every change lands through the same gate — these are hard requirements, not
suggestions:

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

Coverage thresholds live in `vitest.config.ts` and are never lowered. Obsolete tests
are deleted, never skipped. E2E runs use a throwaway data dir and pin the date via
`ARIADNE_FAKE_TODAY` (the seed dataset assumes `2026-07-08`).

## Architecture

Three strictly isolated Electron layers:

```
┌──────────────────────────────────────────────────────────────────┐
│ MAIN (Node)      src/main/                                       │
│   index.ts       bootstrap, window, ariadne-blob:// protocol,    │
│                  single-instance lock, backup scheduling         │
│   ipc.ts         ipcMain.handle registrations → services (glue)  │
│   services/      Config, Storage, Blob, Backup, ImportExport,    │
│                  Todoist (+push), Logger, DebugLog — unit-tested │
│                  against real temp dirs / mocked HTTP            │
├──────────────────────────────────────────────────────────────────┤
│ PRELOAD          src/preload/index.ts                            │
│   exposes window.ariadne implementing AriadneApi                 │
│   (typed in src/shared/ipc-contract.ts) — nothing else leaks     │
├──────────────────────────────────────────────────────────────────┤
│ RENDERER (React) src/renderer/                                   │
│   app/store.ts   Zustand store: data slice + ui slice            │
│   views/ modals/ components/ — thin shells over shared/          │
└──────────────────────────────────────────────────────────────────┘
```

**The one load-bearing rule:** all domain behavior lives in `src/shared/` as pure,
synchronous, dependency-free TypeScript — no Electron, DOM, or fs imports. Main
services and React components stay thin. This is what makes the 80% coverage gate
cheap and refactors safe.

Data flow (auto-save everywhere):

```
user edit → store.apply(pure mutation from shared/domain/mutate.ts)
          → Zustand data slice updates (renderer is authoritative in memory)
          → changed collections sent over IPC
          → StorageService debounces (~300ms) and writes atomically
            (write .tmp → rename) to JSON in the data directory
```

On disk (`Settings → Data` shows the location; user-configurable):

```
<dataDir>/
  workspace.json                # { schemaVersion }
  projects.json  tasks.json  files.json  settings.json
  blobs/<fileId>.<ext>          # uploaded files (served via ariadne-blob://)
  backups/<YYYY-MM-DD>/         # daily + on-quit whole-workspace backups
```

### Module map

| Where                             | What                                                                                                                   |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `src/shared/types.ts`             | Entities (Project, Task, FileEntry, Settings, Workspace), enums, constants                                             |
| `src/shared/schema/`              | zod validation, referential-integrity normalization, import migration                                                  |
| `src/shared/domain/mutate.ts`     | The complete mutation command surface — every state change goes through here                                           |
| `src/shared/domain/derive.ts`     | Derived values: blocked, overdue, due windows, progress, relative labels, scope                                        |
| `src/shared/domain/*.ts`          | reports, calendar, dep-graph, search, sort, tags, todoist (push+completion sync), ai-import, csv, seed                 |
| `src/shared/ipc-contract.ts`      | Channel names + request/response types + the `AriadneApi` bridge interface                                             |
| `src/main/services/`              | Filesystem, backups, blobs, import/export, Todoist HTTP, Claude extraction, debug log (D18) — `.test.ts` twins         |
| `src/renderer/app/store.ts`       | `apply(mutation)` pattern + ui state (view, modal back-stack, scope, search, toast)                                    |
| `src/renderer/views/` + `modals/` | CommandCenter, ProjectDetail, Calendar, Reports, FilesLibrary, TagsView, Settings, SearchResults; Task/File/Day modals |
| `e2e/app.spec.ts`                 | Playwright flows: seed, CRUD, persistence-across-restart, library, reports, backups, tags, debug log                   |

## Adding a feature (the recipe)

Work domain-first — this order is what keeps the gates green:

1. **Domain** — add pure logic to `src/shared/domain/` (a new module or new
   mutations in `mutate.ts` returning `{ workspace, changed }` with structural
   sharing). Write its tests first or alongside; this layer should land near 100%
   covered. If the change persists new data, extend `types.ts` and the zod schemas
   (`shared/schema/workspace-schema.ts`) — use `.catch()` defaults so old
   workspaces load cleanly.
2. **Main service** (only if the feature touches disk/network/OS) — add a service
   class in `src/main/services/` with injectable dependencies (fetch, sleep, clock,
   temp dirs) and test it against real temp directories or mocked HTTP.
3. **IPC** — add the channel to `shared/ipc-contract.ts` (name + types + the
   `AriadneApi` method), register the handler in `src/main/ipc.ts` (thin glue),
   mirror it in `src/preload/index.ts`, and extend the API mocks in
   `src/renderer/test-utils.tsx` **and** `src/renderer/app/store.test.ts`.
4. **UI** — views/components call `store.apply(mutation)` and `getApi()`; no
   business logic in components. Reuse `Card`, `TaskRow`, `SegmentedControl`,
   `ConfirmDialog` (destructive actions always confirm), toasts via `showToast`.
5. **Tests at each layer** you touched, then an E2E flow in `e2e/app.spec.ts` if
   the feature spans process boundaries or must survive a restart.
6. **Gate**: `npm run format && npm run verify && xvfb-run -a npm run test:e2e`,
   update `CHANGELOG.md`, bump the version for user-visible features, commit, tag.

Recent commits are worked examples of exactly this layering: `[v1.1.0]` (backups —
setting + service + IPC + Settings UI + E2E) and `[v1.3.0]` (Todoist push — domain
candidates + HTTP service + IPC + UI preview).

Gotchas that bite:

- `today` is always a parameter; only shells call `todayIso()`
  (`shared/domain/clock.ts`). Never call "now" inside `shared/`.
- Mutations that remove files must surface `removedBlobIds`, and callers must
  invoke `api.deleteBlobs(...)` — blob bytes are not cleaned up magically.
- Task status cycle is `Todo → Doing → Waiting → Done → Todo`; `Dropped` only via
  the select. `completedAt` is non-null iff `Done` (the mutation layer enforces it).
- "Blocked" is derived, never stored; dependency cycles are tolerated — keep graph
  logic visited-set safe.
- Modal state is a back-stack (`day → task → file`); open/close through the store.
- Don't put `.trow` (a flex style) on table rows; tables have `.portfolio-row`.

## Integrations

Todoist uses the **unified API v1** (`api.todoist.com/api/v1/…`) — REST v2 is
retired upstream and answers 410. The client sends a User-Agent, paginates with
cursors, retries transient failures with backoff honoring `retry_after`, and makes
creates idempotent via `X-Request-Id`. Push/import dedupe on a `todoist:<id>`
marker line in task notes. The token is stored plaintext in `settings.json` by
decision D10 (portability).

AI task import (D12) calls the Anthropic API through the official
`@anthropic-ai/sdk` from the **main process only** (`ai-extract-service.ts`),
model `claude-sonnet-5`, with structured outputs pinning the response to a JSON
schema; `shared/domain/ai-import.ts` re-validates leniently (`parseExtraction`),
maps project hints, and creates confirmed tasks — unmapped ones under the
on-demand `AI Imported` placeholder project (`ai-import`). Service tests inject
a fake `fetch` into the real SDK client (`{ fetch, maxRetries: 0 }`) so the
production request/error path is exercised offline.

## Packaging

```sh
npm run package:linux          # AppImage + deb (run on Linux) → release/
npm run package:mac            # DMG + zip for this Mac's architecture (run on macOS)
npm run package:mac:universal  # single DMG for Apple Silicon + Intel
npm run package:win            # Windows x64 NSIS installer (cross-built on Linux) → release/
```

macOS packages **must be built on a Mac** (DMG + signing need Apple tooling).
Notarization is **explicitly off** (`build.mac.notarize: false`) and signing is
**pinned to ad-hoc** (`"identity": "-"`, with `hardenedRuntime: false`) — the
app is for personal use, so no Apple credentials, no keychain access, and no
"codesign wants to use your key" prompts are involved. (Letting electron-builder
auto-discover a keychain cert is what used to hang the build: codesign blocks
silently on the keychain permission dialog, and a Development cert buys nothing
for distribution anyway.) The app launches fine on the build machine; on anyone
else's Mac it shows Gatekeeper's "unidentified developer" friction — macOS ≤ 14
right-click → Open, macOS 15+ System Settings → Privacy & Security → "Open
Anyway" after the first blocked launch. `npm overrides` pins `@noble/hashes` to
1.x for electron-builder; keep it when updating.

#### Notarizing (when the time comes)

To distribute DMGs without the Gatekeeper friction (all steps on the Mac):

1. Join the Apple Developer Program (developer.apple.com, $99/yr). The Team ID
   will match the suffix of the existing cert identity.
2. Create a **Developer ID Application** certificate (Xcode → Settings →
   Accounts → Manage Certificates → “+”) so it lands in the keychain —
   electron-builder auto-picks it over a Development cert.
3. Create an app-specific password: account.apple.com → Sign-In & Security →
   App-Specific Passwords.
4. In `package.json` `build.mac`: set `"notarize": true`, set
   `"hardenedRuntime": true` (notarization requires it; electron-builder
   applies Electron's JIT entitlements automatically), and **remove the
   `"identity": "-"` pin** so electron-builder auto-discovers the
   Developer ID cert. Expect one keychain prompt on the first signing run —
   click "Always Allow" so later builds don't block on it.
5. Package with credentials in the environment:

   ```sh
   export APPLE_ID="<apple id email>"
   export APPLE_APP_SPECIFIC_PASSWORD="xxxx-xxxx-xxxx-xxxx"
   export APPLE_TEAM_ID="<team id>"
   npm run package:mac
   ```

   electron-builder signs with the Developer ID cert, submits to Apple's
   notary service (first run can take several minutes), and staples the
   ticket. Verify with `spctl -a -vv release/mac-arm64/Ariadne.app`.

An end-user guide, `docs/DISTRIBUTION_README.md`, ships with the packages:
the DMG embeds it as `README.txt` (via `build.dmg.contents`), and
`package:win` copies it to `release/README.txt` to send alongside the
installer. The mac **zip** target can't carry extra files — add it to the
archive by hand if you distribute that way. Keep the guide in sync with
user-visible behavior changes (backups, integrations, data paths).

The Windows installer cross-builds on Linux, including the arm64 dev VM — that
path needs the system NSIS (`sudo apt-get install nsis`) plus two shims wired
up by `scripts/package-win.sh`: an `ELECTRON_BUILDER_NSIS_DIR` toolchain dir
(`scripts/nsis-linux-arm64/`, see its README) and a patched
`app-builder-lib` (`patches/`, applied by the `postinstall` hook) that
extracts the uninstaller in pure JS instead of running the installer under
wine. The installer is unsigned, so SmartScreen warns on first run
("More info" → "Run anyway"); the app installs per-user, data in
`%APPDATA%\Ariadne`.

### Shared folders — read this

`node_modules/` contains platform-specific binaries (the Electron runtime, rollup's
native module). If this repo lives in a folder shared between a Linux VM and a Mac,
**use a separate clone per OS**. If a cross-OS install clobbers a checkout anyway:
`node node_modules/electron/install.js` restores the Electron binary and
`npm i --no-save @rollup/rollup-<platform>` restores rollup's native module.

## Releasing

1. `npm run format && npm run verify && xvfb-run -a npm run test:e2e` — all green.
2. Update `CHANGELOG.md`; bump `version` in `package.json`.
3. Commit, `git tag vX.Y.Z`, build packages per platform.

## Documentation map

- `docs/TECHNICAL_SPEC.md` — object model, services, architecture, and the
  **decision table (D1–D10)**: record any deliberate behavior deviation there.
- `docs/IMPLEMENTATION_PLAN.md` — the original 9-sprint delivery plan and its exit
  gates (now history; the gates still apply to every change).
- `design/` — the design handoff: `README.md` (design tokens + screen specs),
  `Throughline.dc.html` (the annotated prototype the app was built from),
  `Ariadne.html` (runnable prototype, login `admin`/`admin`).
- `CHANGELOG.md` — user-facing history per release.
- `CLAUDE.md` — working notes for AI-assisted maintenance.
