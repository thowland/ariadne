# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Ariadne — a **shipped, in-use** single-user, local-first project & task tracker
(Electron + React 18 + TypeScript, electron-vite). All nine delivery sprints are done;
the app is at **v1.3.0** and in maintenance: bug fixes, small features, and dependency
upkeep. The user daily-drives the **macOS build**; development happens on a Linux
arm64 VM.

Read `README.md` first — it holds the architecture, the module map, and the
step-by-step recipe for adding a feature. `docs/TECHNICAL_SPEC.md` remains the
source of truth for domain semantics and the decision table (D1–D10); record any
deliberate behavior change as a new decision row there. `CHANGELOG.md` tracks
releases.

## Commands

- `npm run dev` — run the app (`xvfb-run -a` on this headless VM)
- `npm test` / `npx vitest run <path>` / `npx vitest -t "name"` — unit suite
- `npm run verify` — typecheck + lint + format:check + coverage (≥80% enforced,
  never lowered); run `npm run format` first, since Prettier-clean is part of it
- `xvfb-run -a npm run test:e2e` — Playwright against the built app
- `npm run package:linux` / `package:mac` (mac only on a Mac) — installers

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
  never require a migration step for additive fields.
- **Destructive UI** always goes through `askConfirm` (never `window.confirm`),
  and the confirm dialog must never autofocus its destructive button.
- Domain semantics you must not break: status cycle `Todo→Doing→Waiting→Done→Todo`
  (Dropped via select only); `completedAt` non-null iff Done; blocked is derived
  and cycle-tolerant; deletes cascade (tasks scrub `dependsOn`, projects remove
  files+blobs — surface `removedBlobIds` and call `api.deleteBlobs`); work/home
  report scoping must never leak; `todoist:<id>` note markers drive push/import
  dedupe.

## Environment gotchas (this VM)

- **Node 18.19 on linux-arm64** — tool majors are pinned to Node-18-compatible
  ranges (Vite 6, Vitest 3, ESLint 9, electron-vite 3, @vitejs/plugin-react 4);
  check `engines` before bumping any of them.
- Headless: every app/E2E/screenshot run needs `xvfb-run -a`.
- The repo lives in a folder **shared with the user's Mac**; if they ran npm there,
  platform binaries get swapped. Repair: `node node_modules/electron/install.js`
  and `npm i --no-save @rollup/rollup-linux-arm64-gnu`. Never assume node_modules
  is healthy after a failed launch — check `node_modules/electron/dist` first.
- `mkdirSync` on `/proc/...` paths **hangs** on this VM's filesystem — never use
  /proc paths in tests; use a file-as-directory to provoke fs errors.
- npm's optional-deps bug can drop native modules on any `npm install`; prefer
  `npm ci` after lockfile changes.
- `npm overrides` pins `@noble/hashes@^1` (electron-builder 26 requires it via
  CJS); keep it when touching dependencies.

## External services

Todoist: unified API v1 only (`api.todoist.com/api/v1/…`; REST v2 returns 410 for
everyone). The client already handles pagination, User-Agent, retry/backoff with
`retry_after`, and idempotent creates (`X-Request-Id`). If Todoist errors change
shape, `src/main/services/todoist-service.ts` is the only file that speaks HTTP.
Live token-authenticated verification can only happen on the user's Mac — say so
rather than claiming end-to-end verification.

## Visual reviews

The user likes screenshot-based reviews. Capture via Playwright under xvfb
(`ARIADNE_FAKE_TODAY=2026-07-08` + temp `ARIADNE_TEST_USER_DATA` for the seeded
demo state), inspect the PNGs yourself first, then update the existing review
artifact (republish the same scratchpad HTML path to keep its URL).
