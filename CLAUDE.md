# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Ariadne — a single-user, local-first personal project & task tracker, delivered as an
Electron desktop app (Electron + React 18 + TypeScript + Vite via `electron-vite`).
It is being rebuilt from an HTML prototype; implementation follows a fixed sprint plan.

**Read these before writing code:**

- `docs/TECHNICAL_SPEC.md` — the engineering source of truth: object model, derived-value
  semantics, services, IPC contract, persistence design, and the §1 decision table
  (deliberate deviations from the prototype, e.g. no login/auth, real clock, cascade
  deletes).
- `docs/IMPLEMENTATION_PLAN.md` — sprint scopes (0–8) and the mandatory sprint exit gate.
- `design/Throughline.dc.html` — the annotated prototype. **This is the behavior oracle**:
  when behavior is ambiguous, check the prototype source before inventing anything.
  `design/README.md` documents the data model, screens, and exact design tokens
  (colors, type scale, spacing); `design/Ariadne.html` is a runnable build of the
  prototype (open in a browser, login `admin`/`admin`).

Behavior deviations from the prototype must be recorded as a new row in the spec's §1
decision table, not made silently.

## Commands

Script names are contracted in the implementation plan (scaffolding lands in Sprint 0):

- `npm run dev` — launch the app in dev mode; `npm run build` / `npm run start` for prod
- `npm test` — full Vitest suite; single test: `npx vitest run path/to/file.test.ts`
  (or `npx vitest -t "name pattern"`)
- `npm run test:coverage` — coverage with **enforced ≥80% global thresholds**
  (lines/statements/branches/functions); thresholds live in `vitest.config.ts` and are
  never lowered
- `npm run test:e2e` — Playwright driving Electron (`_electron.launch`); uses a temp data
  dir and pins the date via the `ARIADNE_FAKE_TODAY` env var
- `npm run lint` / `npm run lint:fix`, `npm run format:check`, `npm run typecheck`
- `npm run verify` — runs the whole gate (tests, coverage, lint, format, typecheck);
  required before a sprint-ending commit

## Sprint process (hard requirements)

Every sprint ends only when: the **entire** test suite passes (not just new tests),
coverage ≥ 80%, lint/format/typecheck clean across all files, and the work is committed
(final commit tagged `[sprint-N]`). Obsolete tests are deleted, never skipped. No scope
creep — mid-sprint ideas go to spec §11 (Open Items).

## Architecture (big picture)

Three-layer Electron app with strict isolation (`contextIsolation`, `sandbox`, no
`nodeIntegration`); the renderer is a plain React SPA that talks to the main process only
through the typed IPC contract (`shared/ipc-contract.ts`) exposed as `window.ariadne` by
the preload bridge.

The load-bearing design rule: **all domain behavior lives in `src/shared/` as pure,
synchronous, dependency-free TypeScript** (no Electron, DOM, or fs imports) — types, zod
schemas, derived values (`derive.ts`), the full mutation command surface (`mutate.ts`),
sorting/search/reports/calendar/dep-graph algorithms, seed data. Main-process services
and React views are thin shells around it. UI components must not contain business logic
that could live in `shared/`; this is also what makes the 80% coverage gate cheap.

State & persistence flow (auto-save everywhere, no Save buttons):

```
user edit → store.apply(pure mutation from shared/domain/mutate.ts)
         → Zustand data slice updates (renderer is authoritative in memory)
         → persistence subscriber sends changed collections over IPC
         → main StorageService debounces (~300ms) and writes atomically
           (write .tmp → rename) to human-readable JSON in the data dir
```

On disk: `<dataDir>/projects.json`, `tasks.json`, `files.json`, `settings.json`, plus
`blobs/<fileId>.<ext>` for uploaded binaries (served to the renderer via the
`ariadne-blob://` custom protocol, never over IPC) and `backups/` (rotating snapshots).
The data dir defaults to Electron `userData` but is user-configurable — never assume its
location; go through `ConfigService`.

Time is injected: nothing in `shared/` calls "now" — `today` is always a parameter
(`shared/domain/clock.ts` is the single caller boundary). Tests pin dates; the prototype's
seed data assumes `2026-07-08`.

## Domain gotchas (from the spec/prototype)

- Task status cycle (click circle): `Todo → Doing → Waiting → Done → Todo`; `Dropped` only
  via the select. `completedAt` is non-null iff status is `Done` (mutation layer enforces).
- "Blocked" is derived, never stored: open task with any open `dependsOn` sibling;
  dependency cycles are tolerated (all graph/blocked logic must be visited-set safe).
- Deletes cascade: task deletion scrubs `dependsOn` references everywhere; project
  deletion removes its tasks, files, and blobs.
- Work/Home `scope` filters Command Center and Calendar; report filtering (`all | work |
home | tag:<tag>`) must never leak home projects into work reports (explicitly tested).
- Import must accept both native exports and prototype exports (legacy `project.docs[]` →
  `kind:'ref'` FileEntries; `_blobs` data-URLs → files in `blobs/`).
