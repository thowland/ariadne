# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Ariadne — a **shipped, in-use** single-user, local-first project & task tracker
(Electron + React 18 + TypeScript, electron-vite). All nine delivery sprints are done;
the app is at **v1.11.0** (`package.json`/`CHANGELOG.md` are authoritative) and in
maintenance: bug fixes, small features, and dependency upkeep. The user daily-drives
the **macOS build**; development happens on a Linux arm64 VM.

Read `README.md` first — it holds the architecture, the module map, and the
step-by-step recipe for adding a feature. `docs/TECHNICAL_SPEC.md` remains the
source of truth for domain semantics and the decision table (D1–D17); record any
deliberate behavior change as a new decision row there. `CHANGELOG.md` tracks
releases.

`docs/CODE_REVIEW_2026-07-18.md` is a standing best-practices review: its P1
robustness items are done (status notes inline); the remaining P2–P4 sections
(constants consolidation, color/token cleanup, test-selector hardening) are
agreed future work — consult it before starting refactors in those areas so the
same batch conventions are followed.

## Commands

- `npm run dev` — run the app (`xvfb-run -a` on this headless VM)
- `npm test` / `npx vitest run <path>` / `npx vitest -t "name"` — unit suite
- `npm run verify` — typecheck + lint + format:check + coverage (≥80% enforced,
  never lowered); run `npm run format` first, since Prettier-clean is part of it
- `xvfb-run -a npm run test:e2e` — Playwright against the built app
- `npm run package:linux` / `package:mac` (mac only on a Mac) / `package:win`
  (cross-builds on this VM: needs `apt` NSIS + the `patches/` +
  `scripts/nsis-linux-arm64/` shims — see README "Packaging") — installers

## The gate (unchanged from delivery, applies to every change)

Entire suite green (not just new tests) → coverage ≥80% → lint/format/typecheck
clean → E2E green → commit. Obsolete tests are deleted, never skipped. For
user-visible changes: update `CHANGELOG.md`, bump `package.json` version, tag
`vX.Y.Z`. Fixes ship as plain commits; features get a `[vX.Y.0]` commit + tag.

## Maintenance rules of thumb

- **Bugs**: reproduce with a failing test at the lowest layer that can express it
  (domain > service > component > E2E), then fix. If it was a visual bug, verify
  with a Playwright screenshot under xvfb before claiming victory.
- **Features**: follow the README recipe — domain-first, pure logic in
  `src/shared/` (no Electron/DOM/fs/now() there), thin services and UI. New IPC
  channels touch four places: `shared/ipc-contract.ts`, `main/ipc.ts`,
  `preload/index.ts`, and the API mocks in `renderer/test-utils.tsx` +
  `renderer/app/store.test.ts` (typecheck fails until the mocks match).
- **Persisted-schema changes**: extend `types.ts` + `DEFAULT_SETTINGS` + zod
  schemas with `.catch()`/clamped defaults so existing workspaces load silently;
  never require a migration step for additive fields. `config.json` has its own
  zod schema in `config-service.ts`.
- **Renderer saves are screened** (`shared/schema/write-guard.ts` +
  `StorageService.savePayload`): schema gate plus a tripwire that refuses to
  overwrite a populated collection with an empty list. A new mutation that
  legitimately wipes collections must set `replaceAll: true` on its
  `MutationResult` (see `clearAll`/`replaceWorkspace`) or its saves will be
  rejected. Failed disk writes retry, stay pending, and surface via the
  `storage:saveStatus` push + renderer banner — don't reintroduce silent
  fire-and-forget writes.
- **Destructive UI** always goes through `askConfirm` (never `window.confirm`),
  and the confirm dialog must never autofocus its destructive button.
- Domain semantics you must not break: status cycle `Todo→Doing→Waiting→Done→Todo`
  (Dropped via select only); `completedAt` non-null iff Done; blocked is derived
  and cycle-tolerant; deletes cascade (tasks scrub `dependsOn`, projects remove
  files+blobs — surface `removedBlobIds` and call `api.deleteBlobs`); work/home
  report scoping must never leak; `todoist:<id>` note markers drive push dedupe
  and the completion sync join (D17); archived projects (D13) stay out of every active surface (sidebar,
  Command Center, calendar, reports, Todoist push, project picker) but remain
  intact and searchable.

## Environment gotchas (this VM)

- **Node 18.19 on linux-arm64** — tool majors are pinned to Node-18-compatible
  ranges (Vite 6, Vitest 3, ESLint 9, electron-vite 3, @vitejs/plugin-react 4);
  check `engines` before bumping any of them. **Electron is capped at 39.x**:
  the electron@40+ npm package requires Node ≥ 22.12. When bumping Electron,
  re-test blob previews — Chromium keeps tightening custom-scheme fetch (the
  39 bump needed `corsEnabled` + ACAO headers on `ariadne-blob://`).
- Headless: every app/E2E/screenshot run needs `xvfb-run -a`.
- The repo lives in a folder **shared with the user's Mac**; if they ran npm there,
  platform binaries get swapped. Repair: `node node_modules/electron/install.js`
  and `npm i --no-save @rollup/rollup-linux-arm64-gnu`. Never assume node_modules
  is healthy after a failed launch — check `node_modules/electron/dist` first.
- `mkdirSync` on `/proc/...` paths **hangs** on this VM's filesystem — never use
  /proc paths in tests; use a file-as-directory to provoke fs errors.
- npm's optional-deps bug can drop native modules on any `npm install`; prefer
  `npm ci`. **package-lock.json is untracked** (gitignored — it churned between
  the Mac/Linux checkouts) but kept on disk in each checkout; don't delete it,
  and don't expect it in fresh clones.
- `npm overrides` pins `@noble/hashes@^1` (electron-builder 26 requires it via
  CJS); keep it when touching dependencies.

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
Live token-authenticated verification can only happen on the user's Mac — say so
rather than claiming end-to-end verification.

Claude AI import: `src/main/services/ai-extract-service.ts` is the only file that
talks to Anthropic (official `@anthropic-ai/sdk`, model `claude-sonnet-5`,
structured outputs). Anything touching Claude models/API must read the
`claude-api` skill first — model IDs and API shapes drift. Same Mac-only caveat
for live-key verification. Tests inject `{ fetch, maxRetries: 0 }` into the SDK.

## Visual reviews

The user likes screenshot-based reviews. Capture via Playwright under xvfb
(`ARIADNE_FAKE_TODAY=2026-07-08` + temp `ARIADNE_TEST_USER_DATA` for the seeded
demo state), inspect the PNGs yourself first, then update the existing review
artifact (republish the same scratchpad HTML path to keep its URL).
