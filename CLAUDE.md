# CLAUDE.md

Guidance for Claude Code in this repository. It holds what an agent needs that
the docs do not say, and points at the docs for everything else — if a fact
lives in a doc, link the doc rather than copying it here, because a copy is
what goes stale.

## What this is

Ariadne — a **shipped, in-use** single-user, local-first project and task
tracker (Electron + React + TypeScript, electron-vite). `package.json` and
`CHANGELOG.md` say which version is current.

**Mode: backlog and extension.** Work arrives as a bug the user hit, a small
feature off the backlog, or dependency upkeep, often several unrelated items at
once. Expect to extend surfaces that already exist, and expect the code to
already contain most of what a new feature needs (see "Reuse before you build").

The user daily-drives the **macOS build** and develops on the Mac. A Linux
arm64 VM also exists; it is the only place the Windows installer cross-builds.

## Where things are documented

| Need                                                                        | Read                                                             |
| --------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| Architecture, module map, commands, the add-a-feature recipe, gotchas       | `README.md`                                                      |
| Integrations (Todoist, Claude import), packaging, releasing, shared folders | `README.md`                                                      |
| Domain semantics, invariants (§3.1), the decision table D1, D2, …           | `docs/TECHNICAL_SPEC.md`                                         |
| Dependencies, toolchain ceilings, lockfile, Electron/pdf.js/platform traps  | `docs/MAINTENANCE.md`                                            |
| Agreed future refactors (constants, colour tokens, selectors, React rules)  | `docs/CODE_REVIEW_2026-07-18.md` — read before refactoring there |
| The read-only MCP server                                                    | `docs/CLAUDE_MCP.md`                                             |

Record any deliberate behavior change as a new decision row after the last one
in the spec. When a fact in this file or in `MAINTENANCE.md` stops being true,
fix it there rather than working around it.

**Writing documentation.** Before writing prose a person will read —
`CHANGELOG.md`, `README.md`, anything under `docs/`, the in-app help, release
notes, PR descriptions — load the user's `howland-voice` skill if this session
has it, and write in that voice; without it, match the plain, specific register
of the surrounding docs. `CHANGELOG.md` is for someone using the app: say what
changed for them, not which module moved. Code comments and commit messages
follow the code's own conventions.

## Commands

The README's "Quality pipeline" lists them all. What it does not say:

- On the Linux VM, anything that opens a window (`dev`, `test:e2e`,
  `screenshots`, a packaged app) needs an `xvfb-run -a` prefix. The Mac does not.
- `npm run verify` includes `format:check`, so run `npm run format` first.
- `npm run test:e2e` runs the **full** `build`, because `e2e/mcp.spec.ts` spawns
  `out/mcp/server.mjs`; an app-only build passes locally on a stale `out/` and
  fails on every clean checkout.
- `npm run release:tag` leaves a **draft** GitHub release. Never publish it; the
  user reviews and publishes.

## The gate (every change)

Entire suite green, not just new tests → coverage ≥80% (never lowered) →
lint, format and typecheck clean → E2E green → commit. Obsolete tests are
deleted, never skipped.

For user-visible changes, also: `CHANGELOG.md`, the in-app help
(`renderer/modals/HelpModal.tsx`, whose test asserts each release's features
are mentioned), screenshots if a pictured screen changed, and the version in
`package.json` **and** `package-lock.json` (a two-line lockfile diff — see
`MAINTENANCE.md`). Fixes ship as plain commits; features get a `[vX.Y.0]`
commit and tag. Merges to `master` are `--no-ff`, titled
`Merge branch '<name>' — vX.Y.Z (Dnn–Dmm)`.

For a batch of unrelated backlog items: **one branch, one commit per item**,
cheapest first, and one feature release at the end. If one item turns into a
sinkhole, everything ahead of it is already shippable.

## Reuse before you build

The most common mistake here is a second implementation of something that
already exists, which then drifts from the first. Check first:

- **Box-and-line maps** share `components/NodeMap.tsx` (drag, resize,
  click-vs-drag, snapping per D45) and `shared/domain/node-map.ts`. A new map
  supplies a pure layout and a `renderNode`, nothing more. Drag tests that
  assert exact coordinates hold `altKey`.
- **Typing a task** (dates, `@` people, `#` tags) goes through `QuickAddBox`
  and the pure `finishQuickAdd` / `commitQuickAdd` in
  `shared/domain/quick-add.ts`, which both the project screen and the menu-bar
  flyout use (D51). Never run `findNlDate` over a title that has not been
  through `maskMentions` and `maskHashtags` (D29 × D31 × D40).
- **Workspace aggregations** live in `shared/domain/reports.ts` and
  `derive.ts`; the Projects inventory is `portfolioRollup` + `sortPortfolio`.
- **Dates**: `shared/domain/dates.ts`. On a task use `taskDueLabel`, not
  `relativeDueLabel`, which paints a finished task in alarm red.
- **Bulk task edits** go through `mutate.ts`. `moveTasksToProject` scrubs
  dependency links and carries attached files; a hand-rolled move skips both.
- **Table sorts** follow `sortPortfolio`: a total order with ties broken by
  name in both directions, so a reversed sort is not a reversed array.
- **Saving a file** the user picks a location for: `downloadFile` with
  `content` (the vCard export, D49, needed no new IPC).

## Before you touch…

Each area below has a trap that has already bitten once. The decision row has
the full reasoning; read it first.

- **Persisted fields** — additive only, with zod `.catch()` defaults, and new
  settings default to **off**. `normalizeWorkspace` does not apply
  `settingsSchema`, so test defaults through `settingsSchema.parse`.
  `config.json` has its own schema in `config-service.ts`.
- **Saves** — the write guard refuses to empty a populated collection; a
  mutation that legitimately wipes one sets `replaceAll: true` (README gotchas).
- **Destructive UI, context menus, drag and drop** (D21) — `askConfirm`, never
  `window.confirm`, and never autofocus the destructive button. A context menu
  or a drag is an accelerator, never the only route. Gate drops on
  `dataTransfer.types`, not `getData`; test mocks must carry `types`.
- **PDFs** — view with `PdfViewer` (D24); export reports with `printToPDF`
  (D26), whose print document never loads `app.css` (`MAINTENANCE.md`).
- **The date highlight** (D29) — a mirror element behind a transparent-text
  field; `.nl-mirror` and `.nl-input` must keep identical metrics, so never
  style one without the other. jsdom cannot see drift; the E2E checks geometry.
- **Colour** (D38) — never a literal; tokens in `styles/tokens.css`, with the
  documented exceptions. A new token also goes into `REPORT_PRINT_CSS`.
- **Contacts** (D31–D33) — every link is one-directional; never write both
  sides. `contacts` is a full collection, so anything enumerating collections
  needs it. CSV import is plan, then apply; reading a CSV back needs
  `unguardCsvCell`.
- **The MCP server** (D39) — read-only by construction, and its stdout is the
  protocol: nothing else may print there.
- **The menu-bar flyout** (D51) — holds no data. The main window owns the
  workspace in memory and creates every task; writing from anywhere else gets
  overwritten.
- **Domain invariants** — spec §3.1, plus: archived projects (D13, D19),
  deferrals counted per day (D43), the dock badge ignoring the Work/Home filter
  (D28), report scoping never leaking across Work/Home.
- **Seed data is part of the feature.** A surface the sample workspace never
  reaches is a surface nobody looks at — the Deferred report shipped a broken
  PDF for two releases because the seed had no deferrals. Seed the interesting
  branches. Tests that build their own fixtures start from a cleared baseline.

## Working style

- **Bugs**: reproduce with a failing test at the lowest layer that can express
  it (domain > service > component > E2E), confirm it fails without the fix,
  then fix. For a visual bug, look at a screenshot before claiming victory.
- **Features**: domain first, per the README recipe; nothing in `src/shared/`
  may touch Electron, the DOM, fs or the clock. A new IPC channel touches the
  four places the README lists, and typecheck fails until the mocks match.

## Verifying what jsdom cannot

jsdom has no layout, no second window, no dock and no print engine. When a
change touches one of those, drive the built app under Playwright (rebuild
first; it runs `out/`):

- **A report PDF**: stub only `dialog.showSaveDialog` through
  `app.evaluate(({ dialog }) => …)`, click the real button, then rasterize the
  file with `pdfjs-dist` + `@napi-rs/canvas` and look at it. `pdftoppm` is not
  installed.
- **The dock badge**: `app.evaluate(({ app }) => app.getBadgeCount())`.
- **A drag**: `locator.dragTo()` performs a real one; jsdom `fireEvent` only
  proves the handlers are wired.
- **Anything positional**: compare `boundingBox()` values. `e2e/` is
  typechecked without the DOM lib, so no `document` in `page.evaluate`.
- **The menu-bar flyout**: the tray icon cannot be clicked from Playwright, but
  the flyout is an ordinary window in `app.windows()`; show it with
  `app.evaluate(({ BrowserWindow }) => …)` to screenshot it.
- **OS integration** runs on the Linux CI runner too; guard macOS-only
  assertions by platform (`MAINTENANCE.md`, "Platforms").

## Visual reviews

The user likes screenshot-based reviews. Capture through Playwright with
`ARIADNE_FAKE_TODAY=2026-07-08` and a temp `ARIADNE_TEST_USER_DATA` for the
seeded demo state, inspect the PNGs yourself first (views fade in, so wait
before capturing), then share them. Before/after pairs are worth it for a
visual fix. A throwaway `.cjs` in the scratchpad can load Playwright's
`_electron` through `createRequire('<repo>/package.json')` and launch with
`args: ['.']`, `cwd: <repo>`, as `e2e/app.spec.ts`'s `launch()` does.

A packaged build launched while the user's copy is running hands the `open` to
their instance; use a temp `ARIADNE_TEST_USER_DATA` and run the binary inside
the `.app` directly.

## External services

Todoist and the Claude import each have exactly one file that speaks HTTP (see
README "Integrations"). Read the `claude-api` skill before touching anything
Claude-related, because model IDs and API shapes drift. Live verification of
either needs the user's own token or key; say so rather than claiming
end-to-end verification.
