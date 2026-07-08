# Ariadne — Implementation Plan

**Version:** 1.0 · **Date:** 2026-07-08 · Companion to `docs/TECHNICAL_SPEC.md`

The delivery is organized as nine sprints (0–8). Sprints are ordered so that every sprint
ends with a **working, tested, committed** application that is strictly more capable than
the last. The domain layer (`src/shared/`) leads the UI: pure logic lands with exhaustive
unit tests first, and views are thin, testable shells over it.

## Sprint Exit Gate (applies to EVERY sprint)

A sprint is not done until all of the following hold, in this order:

1. **All tests pass** — the _entire_ suite (`npm test`), not just tests added this sprint.
   Tests made obsolete by intentional behavior changes are deleted, not skipped.
2. **Coverage ≥ 80 %** — `npm run test:coverage` passes its enforced global thresholds
   (lines, statements, branches, functions). Thresholds live in `vitest.config.ts` and are
   never lowered.
3. **Lint clean** — `npm run lint` (ESLint over all files) and `npm run format:check`
   (Prettier) report zero errors across the whole repository.
4. **Typecheck clean** — `npm run typecheck` (`tsc --noEmit`) passes.
5. **E2E smoke passes** (from Sprint 2 onward) — `npm run test:e2e`.
6. **Commit** — working tree clean, one or more well-formed commits on `master`
   describing the sprint's work; the sprint's final commit message is tagged
   `[sprint-N]`.

A single command, `npm run verify`, runs gates 1–4 (plus 5 where applicable) and is the
required pre-commit check at sprint end.

---

## Sprint 0 — Foundations: tooling, test frameworks, linters

**Goal:** an empty-but-runnable Electron + React + TypeScript app with the full quality
pipeline in place, so every later sprint only adds features, never infrastructure.

- Scaffold `electron-vite` project (main / preload / renderer) per the spec's source
  layout; strict `tsconfig` (separate configs for node and browser code); `.gitignore`,
  `.editorconfig`, top-level `README.md` (how to run, test, build).
- **Lint/format:** ESLint flat config (typescript-eslint, react, react-hooks, import
  order) + Prettier; scripts `lint`, `lint:fix`, `format`, `format:check`.
- **Unit tests:** Vitest with two projects (node env for `shared`+`main`, jsdom for
  `renderer`), @testing-library/react, coverage via v8 with **80 % global thresholds
  enforced** for lines/statements/branches/functions.
- **E2E:** Playwright installed and wired for `_electron.launch()` with a temp data dir
  and `ARIADNE_FAKE_TODAY` support; one placeholder test (app launches, window title is
  "Ariadne") — activated as a required gate from Sprint 2.
- `npm run verify` orchestration script; `dev`, `build`, `start` scripts.
- Prove the pipeline with a real seed module: implement `shared/domain/clock.ts`,
  `shared/domain/id.ts`, and date helpers (`dayDiff`, `isoAdd`, format functions) with
  full unit tests.
- The window opens and renders a minimal placeholder shell (app background + "Ariadne").

**Exit demo:** `npm run verify` green from a fresh clone; `npm run dev` opens the window.

---

## Sprint 1 — Domain model & filesystem persistence

**Goal:** the complete object model and a durable local persistence layer; the app loads
and saves a real workspace from disk. No product UI yet.

- `shared/types.ts`, constants, zod schemas (validation + defaults + legacy `docs[]`
  migration).
- `shared/domain/`: `derive.ts` (all derived values, §4 of the spec), `sort.ts`,
  `mutate.ts` (full mutation command surface, §5.2), `search.ts`, `seed.ts` (ported
  sample dataset). Exhaustive unit tests pinned to a fixed `today` — including edge
  cases: dependency cycles, cascade deletes, `completedAt` stamping/clearing, task
  re-homing across projects.
- Main services: `ConfigService` (config.json, dataDir resolution, first-run seeding),
  `StorageService` (atomic write-temp-rename, zod-validated loads, corrupt-file
  quarantine + restore), `BackupService` (session snapshot, keep 10). Tested against real
  temp directories.
- IPC contract + preload bridge + renderer `api.ts`; `workspace:load` / `workspace:save`
  round-trip.
- Renderer: Zustand store (data + ui slices), `apply(mutation)` pattern, persistence
  write-through subscriber with debounce, flush-on-quit. Dev-only debug view proves a
  create→restart→reload round trip.

**Exit demo:** create seed data on first run; mutate via debug view; kill and relaunch the
app; data is intact. Pull the plug mid-write; no corruption (temp-rename).

---

## Sprint 2 — App shell, Command Center, search

**Goal:** the first real product surface — the daily review — plus global chrome.

- Global chrome: sidebar (brand, nav + overdue badge, project list with counts,
  "+ project"), top bar (title, long date, overdue pill, search box, "+ New task"),
  design tokens in `tokens.css`, self-hosted Public Sans, toast system.
- Command Center view: stat cards, ambient banner, the five conditional focus sections,
  portfolio project cards, Work/Home/All scope control, empty states.
- Shared components: `TaskRow` (status cycle circle, blocked pill, priority dot, relative
  due label), `ProjectCard`, `StatCard`, `Pill`, `Card`, `SegmentedControl`.
- Search: `shared/domain/search.ts` wired to the top bar; results view (projects grid +
  task rows); clearing returns to the prior view.
- Create project / create task actions (navigate to project view stub / open a task-modal
  stub — full editors come in Sprint 3).
- Playwright smoke becomes a required gate: launch → seeded Command Center renders →
  scope filter works → search finds a seeded task.

**Exit demo:** open the app, see your day; filter Work/Home; search; click through to
(placeholder) project view.

---

## Sprint 3 — Project workspace & task editor

**Goal:** full CRUD on projects and tasks — the app becomes genuinely usable day-to-day.

- Project detail view: editable name/category/tags header, delete-with-confirm (cascade),
  tasks card with canonical sort + inline quick-add, Notes textarea, Links editor.
- Task modal: every field (project/due/status/priority grid, tags, notes, subtasks,
  Blocked-by sibling checkboxes, links), auto-save, status-cycle header circle,
  Escape/backdrop close, delete-with-confirm.
- Blocked semantics surfaced end-to-end (Command Center Blocked section, blocked pills).
- In-app confirm dialog component (replaces `window.confirm` everywhere).
- Component tests for both views; mutation edge cases already covered in Sprint 1 stay
  green (regression suite). E2E: create project → add tasks → set dependency → verify
  blocked pill → restart → verify persisted.

**Exit demo:** run your real projects in Ariadne for a day.

---

## Sprint 4 — Calendar & dependency map

**Goal:** the two visualization surfaces.

- `shared/domain/calendar.ts` (month-grid cells, chips ≤ 4 + "+N more", upcoming top 10)
  - Calendar view with ‹/Today/› paging and scope control.
- `shared/domain/dep-graph.ts` (longest-path layering, cycle-safe, centered horizontal
  rows stacking downward, edge routing) with thorough unit tests (diamond, chain, cycle,
  disconnected); SVG `DependencyMap` component with status-colored nodes, click → task
  modal, empty-state hint.
- Today-rollover behavior (focus/midnight refresh of `today`).

**Exit demo:** July laid out on the calendar; the seeded migration project shows its
dependency chain; clicking a node opens the task.

---

## Sprint 5 — Document library & file viewer

**Goal:** per-project reference material and task attachments.

- `BlobService` + `ariadne-blob://` protocol; upload path renderer → IPC → disk; delete
  cascades blob removal (and project deletion cascades files+blobs — spec D8).
- Library card in project view (+ Markdown, Upload, file rows with type badges, download,
  delete); attachments section in the task modal; owning-task labels.
- File viewer modal: markdown Preview/Edit (marked + DOMPurify, editable filename), PDF
  `<object>`, CSV table via shared parser (first 300 rows), images, download-only
  placeholder for docx/xlsx/pptx/rtf; "‹ Back to task" stack behavior.
- Unit tests: CSV parser, markdown sanitization (script injection stays inert), blob
  service fs behavior; E2E: upload → preview → restart → still there → download.

**Exit demo:** attach a PDF and a markdown note to a task; edit the note; reopen from the
project library.

---

## Sprint 6 — Reports & settings

**Goal:** the communicate-upward surface and full data management.

- `shared/domain/reports.ts`: four report builders + plain-text serializers, fully
  unit-tested against the seed dataset (weekly windows, retro ranges, at-risk reasons,
  tag/work/home filters — the "work reports never leak home projects" requirement gets
  explicit tests).
- Reports view: type segmented control, tag/scope select, retro date range, Copy report
  (clipboard + toast).
- Settings view: **Data** (current data dir + Change… with migrate/load flow, Export
  JSON, Import from file, Import pasted JSON, Reset to sample data, Clear all — all with
  confirms), **Reference** legend. (Account section intentionally absent — no auth.)
- `ImportExportService` incl. prototype-export compatibility (`_blobs` data-URLs,
  legacy `docs[]`) — round-trip tested; import of the actual prototype's export file is a
  fixture test.

**Exit demo:** copy a weekly status filtered to Work; export the workspace, clear all,
re-import, everything restored including blobs.

---

## Sprint 7 — Todoist import

**Goal:** capture on mobile, review in Ariadne.

- `TodoistService` per spec §9: REST v2 fetch, mapping, Todoist-id dedupe, re-import
  update semantics, typed error results; token via `safeStorage`; Settings Integrations
  section (token field, Import now, last-import timestamp, result toasts).
- Tests: mapping/dedupe/merge logic fully unit-tested against recorded API fixtures;
  service tests with a mocked HTTP layer (no live network in CI); one manual live
  verification against a real token.

**Exit demo:** add tasks in Todoist on your phone; press Import; they appear in the
Todoist Inbox project with due dates and priorities.

---

## Sprint 8 — Hardening, packaging & 1.0 release

**Goal:** ship it.

- `electron-builder` packaging (Linux AppImage/deb first; mac/win targets configured),
  app icon from the spiral mark, window-bounds persistence, single-instance lock.
- Hardening pass: error-boundary polish, storage failure paths (disk full, read-only
  dir, missing dataDir on external drive), backup restore flow verified, log rotation.
- Performance sanity at design scale ×5 (100 projects / 5 000 tasks): view render and
  save latency acceptable.
- E2E suite extended to cover the packaged build boot path; full manual test script
  executed against the design README's screen-by-screen behavior checklist.
- Final docs: user-facing README (install, data layout, backup/restore), CHANGELOG,
  version 1.0.0 tag.

**Exit demo:** install the packaged app on a clean machine; daily-drive it.

---

## Working Agreements

- **Feature order within a sprint:** shared domain logic + tests → main services + tests
  → UI + component tests → E2E. UI never contains business logic that could live in
  `shared/`.
- **Prototype is the behavior oracle.** When a question comes up mid-sprint, check
  `design/Throughline.dc.html` before inventing behavior; deviations get recorded as a
  decision row in the spec's §1 table.
- **Coverage is a floor, not a target** — new `shared/domain` code should land near 100 %;
  the 80 % global gate mostly absorbs view plumbing.
- **No sprint scope creep.** Nice-to-haves discovered mid-sprint go to the spec's §11
  Open Items list.
