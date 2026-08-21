# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Ariadne — a **shipped, in-use** single-user, local-first project & task tracker
(Electron + React 18 + TypeScript, electron-vite). The app is at **v2.0.0**
(`package.json`/`CHANGELOG.md` are authoritative).

**Mode: backlog and extension.** The greenfield build is long done. Work now
arrives as a bug the user hit, a small feature off the backlog, or dependency
upkeep — usually several unrelated items at once. Expect to extend surfaces that
already exist rather than invent new ones, and expect the existing code to
already contain most of what a new feature needs (see "Reuse before you build").

The user daily-drives the **macOS build**, and development now happens on the
Mac too. A Linux arm64 VM is still available and has its own gotchas — see
"Linux VM" below.

Read `README.md` first — it holds the architecture, the module map, and the
step-by-step recipe for adding a feature. `docs/TECHNICAL_SPEC.md` remains the
source of truth for domain semantics and the decision table (**D1–D31**); record
any deliberate behavior change as a new decision row there. `CHANGELOG.md`
tracks releases and is written for the user, not for developers — describe what
changed for someone using the app, not which module moved.

`docs/CODE_REVIEW_2026-07-18.md` is a standing best-practices review: its P1
robustness items are done (status notes inline); the remaining P2–P5 sections
(constants consolidation, color/token cleanup, test-selector hardening, React
Compiler rules) are agreed future work — consult it before starting refactors in
those areas so the same batch conventions are followed.

## Commands

Commands below are as run **on the Mac**. On the Linux VM, every command that
opens a window (`dev`, `test:e2e`, `screenshots`, any packaged-app run) needs an
`xvfb-run -a` prefix.

- `npm run dev` — run the app
- `npm test` / `npx vitest run <path>` / `npx vitest -t "name"` — unit suite
- `npm run verify` — typecheck + lint + format:check + coverage (≥80% enforced,
  never lowered); run `npm run format` first, since Prettier-clean is part of it
- `npm run test:e2e` — Playwright against the built app (21 specs, ~40s)
- `npm run screenshots` — regenerate `docs/screenshots/` from the seeded demo state
- `npm run package:mac` (arm64 only) / `package:mac:universal` (what the release
  builds) / `package:linux` / `package:win` (cross-builds on the VM: needs `apt`
  NSIS + the `patches/` + `scripts/nsis-linux-arm64/` shims — see README
  "Packaging") — installers
- `npm run release:tag` — tag `package.json`'s version and push it to the
  `github` remote, which triggers the release build. `-- --dry-run` previews.
  It refuses a dirty tree, a missing `CHANGELOG.md` section, an unpushed
  commit, and any tag that already exists on the remote (released tags are
  immutable — cut the next version instead). The workflow leaves a **draft**
  release for the user to review and publish; don't publish it yourself.

## The gate (applies to every change)

Entire suite green (not just new tests) → coverage ≥80% → lint/format/typecheck
clean → E2E green → commit. Obsolete tests are deleted, never skipped. For
user-visible changes: update `CHANGELOG.md`, bump `package.json` **and
`package-lock.json`** version, tag `vX.Y.Z` (`npm run release:tag` once the
branch is pushed). Fixes ship as plain commits; features get a `[vX.Y.0]`
commit + tag.

For a batch of unrelated backlog items, prefer **one branch, one commit per
item**, cheapest first. A single feature release at the end beats six tags, and
if one item turns into a sinkhole everything ahead of it is already shippable.

## Reuse before you build

The most common mistake on this codebase is writing a second implementation of
something that already exists, which then drifts from the first. Before adding
logic, check whether it is already there:

- **Aggregations over the workspace** live in `shared/domain/reports.ts` and
  `derive.ts`. The Projects inventory screen is `portfolioRollup` + `sortPortfolio`
  with an extra column — not its own counting pass.
- **Anything date-shaped** is in `shared/domain/dates.ts`. `taskDueLabel` already
  encodes "Done/Dropped tasks cannot be overdue"; reaching for `relativeDueLabel`
  on a task is usually the bug (it colours by date alone and paints a completed
  task in alarm red).
- **Bulk task edits** go through the `mutate.ts` functions. `moveTasksToProject`
  already scrubs the dependency links a move cannot keep and drags attached files
  along — a drag-and-drop that re-implements the move will silently skip both.
- **Sorting a table**: `sortPortfolio` is the pattern (total order, ties broken
  by name in _both_ directions). A reversed sort is therefore **not** a reversed
  array — don't assert that in a test.

## House rules

- **Bugs**: reproduce with a failing test at the lowest layer that can express it
  (domain > service > component > E2E), then fix. Confirm the new test actually
  fails without the fix — a test that passes either way is worthless. If it was a
  visual bug, look at a screenshot before claiming victory.
- **Features**: follow the README recipe — domain-first, pure logic in
  `src/shared/` (no Electron/DOM/fs/now() there), thin services and UI. New IPC
  channels touch four places: `shared/ipc-contract.ts`, `main/ipc.ts`,
  `preload/index.ts`, and the API mocks in `renderer/test-utils.tsx` +
  `renderer/app/store.test.ts` (typecheck fails until the mocks match).
- **Persisted-schema changes**: extend `types.ts` + `DEFAULT_SETTINGS` + zod
  schemas with `.catch()`/clamped defaults so existing workspaces load silently;
  never require a migration step for additive fields. New settings default to
  **off**, so upgrading changes nothing until the user opts in. `config.json` has
  its own zod schema in `config-service.ts`. Note `normalizeWorkspace` does _not_
  apply `settingsSchema` — the schema runs at the storage/import layer, so test
  schema defaults through `settingsSchema.parse`, not through normalization.
- **Seed data is part of the feature.** A surface the sample workspace never
  exercises is a surface nobody looks at: the deferred report (D23) shipped with
  a broken PDF layout for two releases because `seedWorkspace` had no deferral
  history, so the demo state, the screenshots and the E2E suite only ever
  rendered its empty state. When adding a surface, seed data that reaches its
  interesting branches. Tests that construct their own fixtures should start from
  a cleared baseline rather than assuming the seed is empty.
- **Renderer saves are screened** (`shared/schema/write-guard.ts` +
  `StorageService.savePayload`): schema gate plus a tripwire that refuses to
  overwrite a populated collection with an empty list. A new mutation that
  legitimately wipes collections must set `replaceAll: true` on its
  `MutationResult` (see `clearAll`/`replaceWorkspace`) or its saves will be
  rejected. Failed disk writes retry, stay pending, and surface via the
  `storage:saveStatus` push + renderer banner — don't reintroduce silent
  fire-and-forget writes.
- **Destructive UI** always goes through `askConfirm` (never `window.confirm`),
  and the confirm dialog must never autofocus its destructive button. Bulk
  edits that aren't deletions pass `{ confirmLabel, danger: false }` (D21).
- **Context menus** (D21) are accelerators only: every item must also be
  reachable through ordinary UI. They render from one `contextMenu` store
  slot via `App`, so only one is ever open; the first non-destructive row
  takes focus, mirroring the confirm rule. The same rule governs the
  task→project **drag**: it is a shortcut for the task editor's project picker
  and the context menu's move command, never the only route.
- **Drag and drop** distinguishes payloads by MIME type (`shared` constant in
  `renderer/app/dnd.ts`), because tasks and projects are both dropped on the
  sidebar. `dataTransfer.getData` is deliberately blanked during `dragover` but
  `dataTransfer.types` is readable for the whole gesture, so gate accept/reject
  on `types` — never on `getData` returning something, which cannot tell a
  missing key from a real value. Test mocks must carry a `types` array or they
  simulate a drag that cannot exist.
- **PDFs** render via `renderer/components/PdfViewer.tsx` (pdf.js → canvas), never
  an `<object>`/`<iframe>`: Electron only gives PDFs to Chromium's viewer on a
  top-level navigation, so an embedded frame silently shows its fallback (D24).
  The component takes `{ url }` or `{ data }`, so report PDFs from
  `webContents.printToPDF` can preview without touching disk. pdfjs-dist 6
  swapped its optional `canvas` dep for `@napi-rs/canvas`, which ships prebuilt
  per-platform skia binaries the renderer never loads. `build.files` excludes
  it (`!node_modules/@napi-rs/canvas*/**`) — without that, the **universal mac
  build fails**: npm installs only the runner's own arch, so the same
  `skia.darwin-arm64.node` lands in both halves and `@electron/universal`
  refuses to merge an identical `.node` not listed in `x64ArchFiles`. Linux and
  Windows never merge arches, so they build fine and hide the problem. The
  `canvas` entry left in `npm overrides` now only serves jsdom's optional peer.
- **Report PDFs** go through `webContents.printToPDF` in an offscreen window
  (`main/services/report-pdf-service.ts`), never pdf.js — that library reads
  PDFs, it cannot write them (D26). The renderer captures the live report
  markup and wraps it with `shared/domain/report-print.ts`, so one path serves
  all five reports. **The print document does not load `app.css`**, so every
  layout class the reports render needs its own rule in `REPORT_PRINT_CSS`; an
  unstyled class silently degrades to a block, which is how an 8-cell grid
  became 16 stacked lines. A test in `report-print.test.ts` enforces the class
  list — extend it when you add report markup. Use explicit column counts
  (`repeat(4, 1fr)`), not `auto-fit`, which resolves against the print viewport
  rather than the paper; `<span>`s sized by inline style (dots, pills) are
  invisible until given an explicit `display`.
- **Contacts** (D31): `shared/domain/contacts.ts` owns naming, the project↔contact
  join, and the `@`-mention parser. The join is **one-directional** — a task owns
  its `contactIds`, a project owns only the people attached to the project
  itself, and the card shows `projectContacts`' union of the two. Never write the
  same person into both sides "to keep them in sync"; that is the drift the union
  exists to prevent. `contacts` is a full collection (`contacts.json`, in
  `COLLECTION_NAMES`), so anything that enumerates collections — the write guard,
  backups, the archive manifest, the data-dir migration — needs it too. The
  mention rules are anchored like the D29 date rules and for the same reason,
  and — also like D29 — the picked name **stays in the title**, completed in
  place from `@dan` to `@Dana Reyes`. Enter never _creates_ a contact: with no
  match it falls through to whatever owns the field, so quick-add still commits
  the task instead of inventing a person out of a typo. The quick-add box
  defers creation through `onCreateContact` until the task exists — do not
  "simplify" that back into an immediate `newContact` call. **D29 and D31 share
  one string**: `maskMentions` blanks `@name` runs (preserving every offset)
  before `findNlDate` reads the title, because `tom` is a tomorrow
  abbreviation and completing `@Tom Whitaker` otherwise sets a due date nobody
  asked for. Sat, May, Mar and Wed are all names too — never run the date
  scanner over unmasked text. A
  workspace written before 2.0 has no `contacts.json` at all: that is a missing
  document, not corruption, and `normalizeWorkspace` scrubs the now-dangling ids
  rather than rendering people who do not exist.
- **Natural-language dates** (D29): `shared/domain/nl-date.ts` is pure and takes
  `today` as an argument. Every rule is `\b`-anchored — that is what keeps `sat`
  out of "satisfy" and `mar` out of "marching" — and bare numbers are never read
  as days. A false positive silently changes a due date the user never asked to
  change, so widen the vocabulary only with tests for the words it must _not_
  match. The highlight is a mirror element behind a transparent-text field
  (nothing can style a range inside a `<textarea>`): `.nl-mirror` and `.nl-input`
  must keep identical font, padding, border and wrapping metrics or the mark
  drifts off the word — **never style one without the other**. jsdom has no
  layout and cannot catch drift; the E2E asserts the mark's real geometry.
- Domain semantics you must not break: status cycle `Todo→Doing→Waiting→Done→Todo`
  (Dropped via select only); `completedAt` non-null iff Done; blocked is derived
  and cycle-tolerant; deletes cascade (tasks scrub `dependsOn`, projects remove
  files+blobs — surface `removedBlobIds` and call `api.deleteBlobs`); work/home
  report scoping must never leak; `todoist:<id>` note markers drive push dedupe
  and the completion sync join (D17); archived projects (D13) stay out of every
  active surface (sidebar, Command Center, calendar, reports, Todoist push,
  project picker) but remain intact and searchable — the retrospective is the
  sole report that still counts them (D19), and the Projects inventory is the
  one screen that will show them, behind an explicit opt-in toggle;
  dependency-map node positions and card height are hand-placed, per-project,
  optional-additive fields (D20); deleting a contact scrubs its links but never
  deletes a task or project (D31); the dock badge (D28) counts the **whole**
  workspace and deliberately ignores the Work/Home filter, because it is what
  you see when the app is not in front of you.

## Verifying things that unit tests can't reach

jsdom has no layout, no dock, and no print engine. When a change touches one of
those, drive the real app under Playwright rather than asserting on intent:

- **A report's PDF**: launch the app, stub only `dialog.showSaveDialog` via
  `app.evaluate(({ dialog }) => …)` to return a temp path, click the real PDF
  button, then rasterize the result to PNG with `pdfjs-dist` + `@napi-rs/canvas`
  and look at it. This exercises the genuine `printToPDF` path end to end.
  (`pdftoppm` is not installed; don't reach for the Read tool's PDF rendering.)
- **The dock badge**: `app.evaluate(({ app }) => app.getBadgeCount())` reads what
  Electron actually handed the OS, not what the renderer believes.
- **Gate OS-integration assertions on the platform.** The E2E suite runs on the
  **Linux** CI runner, not on your Mac, so anything that only works on macOS
  will pass locally and fail every CI run afterwards — `setBadgeCount` no-ops on
  headless Ubuntu (it needs a Unity launcher) and left CI red for four runs
  before anyone looked. Put the cross-platform half of the behaviour (the
  setting persists, the count is right) in the unit suite and guard only the
  OS-level assertion with `process.platform === 'darwin'`. Sanity-check the
  skipped path by flipping the constant to `false` and re-running, or the
  guarded branch is never exercised anywhere.
- **CI failures do not block a release.** The release workflow builds
  installers and does not run the E2E suite, so a broken E2E ships happily.
  Check `gh run list` after pushing rather than trusting a green release.
- **A drag**: Playwright's `locator.dragTo()` performs a real drag; the jsdom
  `fireEvent` version only proves the handlers are wired.
- **Anything positional** (highlights, overlays): compare `boundingBox()` of the
  two elements. Don't use `page.evaluate` with `document` in `e2e/` — that file
  is typechecked without the DOM lib.

## Environment

- **Node 24 is the floor** (`engines: >=24.0.0`, CI and release both on 24.x)
  as of 2026-08-06. Node 18 and 20 are both past end-of-life (2025-04-30 and
  2026-04-30); Node 26 becomes LTS in Oct 2026 and should join the CI matrix
  then. The old Node-18 pins are gone — Electron is no longer capped at 39.x.
  When bumping Electron, still re-test blob previews: Chromium keeps
  tightening custom-scheme fetch (the 39 bump needed `corsEnabled` + ACAO
  headers on `ariadne-blob://`; verified again on 43/Chromium 150).
- **Toolchain ceilings** (checked 2026-08-06) — these are peer-dependency
  limits, not Node limits, so don't retry them on the next Node bump:
  - **Vite is capped at 7**: `electron-vite@5` peers `vite ^5||^6||^7`. Vite 8
    needs electron-vite to move first, and `@vitejs/plugin-react` must stay on
    5.x in the meantime (6.x requires Vite 8).
  - **ESLint is capped at 9**: `eslint-plugin-react` peers up to `^9.7` and
    `eslint-plugin-import` up to `^9`. `typescript-eslint` and
    `eslint-plugin-react-hooks` already accept `^10`, so react/import are the
    blockers; swapping in `eslint-plugin-import-x` alone would not clear it.
  - `eslint-plugin-react-hooks@7` expanded `recommended` from 2 rules to 16.
    `eslint.config.mjs` enables only the two classic rules on purpose — see
    P5 in `docs/CODE_REVIEW_2026-07-18.md` for the 9 findings the rest raise.
- **npm 11 (bundled with Node 24) blocks dependency install scripts by
  default.** Approvals live in `package.json` under `allowScripts`, pinned per
  version (`esbuild@0.25.12: true`), so a dependency bump needs a fresh
  `npm approve-scripts <pkg>` or its install step silently does not run.
  `npm approve-scripts --allow-scripts-pending` lists what is waiting.
- **Electron 43 no longer downloads its binary via a postinstall** — the
  package ships no scripts at all and fetches lazily on first `require`. The
  project's own `postinstall` runs `install-electron` explicitly so a fresh
  `npm ci` fails loudly rather than downloading 100MB in the middle of an E2E
  run. Don't remove it; `node_modules/electron/dist` missing is the symptom.
- **pdf.js 6 evaluates `DOMMatrix`/`Path2D`/`ImageData` at import time**, which
  jsdom does not implement, so every test file that transitively imports
  `PdfViewer` dies on module load without the stubs in
  `renderer/test-setup.ts`. Its API also moved between 4 and 6: teardown is
  `loadingTask.destroy()` (not on `PDFDocumentProxy`), and `page.render()`
  wants `canvas` alongside `canvasContext`.
- **JS date parsing is lenient and `isValidIsoDate` compensates.** V8 rolls an
  out-of-range day forward rather than returning NaN, so `2026-02-30` used to
  validate and become March 2. The helper now round-trips the parsed components;
  it backs the workspace schema and the AI import, so don't "simplify" it back to
  a `Number.isNaN` check.
- npm's optional-deps bug can drop native modules on any `npm install`; prefer
  `npm ci`, which CI and the release matrix both use.
- **package-lock.json is tracked** as of 2026-08-06 — Dependabot can't raise
  security-fix PRs without it, and `npm ci` needs it. The user's global
  gitignore excludes it, so the repo `.gitignore` carries an explicit
  `!package-lock.json` negation — don't remove it.
  - It must stay **multi-platform**: it carries the optional rollup/esbuild
    binaries for linux, darwin and win32 so `npm ci` works on every runner.
    Regenerating it with `node_modules` present **prunes it to the current
    platform** and silently breaks CI. The recipe that works:
    `mv node_modules /tmp/x && rm package-lock.json && npm install
--package-lock-only && mv /tmp/x node_modules` (the postinstall
    `patch-package` step errors while node_modules is away — harmless, the
    lockfile is still written). Afterwards check
    `grep -c '@rollup/rollup-linux-x64-gnu' package-lock.json` is 1.
  - Resolve merge conflicts in it with a regeneration, never by hand, and
    commit it alongside every `package.json` change.
- `npm overrides` pins `@noble/hashes@^1` (electron-builder 26 requires it via
  CJS); keep it when touching dependencies.

### Linux VM (secondary)

The Mac is primary now, but the arm64 VM is still around and is the only place
that cross-builds the Windows installer. If working there:

- Headless: every app/E2E/screenshot run needs `xvfb-run -a`.
- The repo folder is **shared with the Mac**, so platform binaries get swapped
  by whichever machine last ran npm. Repair on the VM with
  `node node_modules/electron/install.js` and
  `npm i --no-save @rollup/rollup-linux-arm64-gnu`. Never assume node_modules is
  healthy after a failed launch — check `node_modules/electron/dist` first.
- `mkdirSync` on `/proc/...` paths **hangs** on that filesystem — never use
  /proc paths in tests; use a file-as-directory to provoke fs errors.

## External services

Todoist: unified API v1 only (`api.todoist.com/api/v1/…`; REST v2 returns 410 for
everyone). Two directions, both keyed on the `todoist:<id>` note marker: **push**
(bulk from Settings, or a single task from the task editor — D16) and the
**completion sync** (D17: `/tasks/completed/by_completion_date`, 30-day lookback,
marks pushed tasks Done here; replaced the old pull-everything import in v1.10 —
there is no Todoist→Ariadne task creation anymore). The client already handles
pagination, User-Agent, retry/backoff with `retry_after`, idempotent creates
(`X-Request-Id`), and non-JSON 200 bodies. If Todoist errors change shape,
`src/main/services/todoist-service.ts` is the only file that speaks HTTP.
Live token-authenticated verification needs the user's real token — say so
rather than claiming end-to-end verification.

Claude AI import: `src/main/services/ai-extract-service.ts` is the only file that
talks to Anthropic (official `@anthropic-ai/sdk`, model `claude-sonnet-5`,
structured outputs). Anything touching Claude models/API must read the
`claude-api` skill first — model IDs and API shapes drift. Same caveat about
live-key verification. Tests inject `{ fetch, maxRetries: 0 }` into the SDK.

## Visual reviews

The user likes screenshot-based reviews. Capture via Playwright
(`ARIADNE_FAKE_TODAY=2026-07-08` + a temp `ARIADNE_TEST_USER_DATA` for the seeded
demo state), **inspect the PNGs yourself first**, then send them to the user
directly. Before/after pairs are worth the extra capture when fixing a visual
bug — they show the fix rather than asserting it.

Launching a packaged build while the user's own copy is running will hand the
`open` to their instance instead; use a temp `ARIADNE_TEST_USER_DATA` and run the
binary inside the `.app` directly to get a separate process.
