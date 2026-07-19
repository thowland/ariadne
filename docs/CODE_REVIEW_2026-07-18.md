# Code Review — Recommendations (2026-07-18, v1.10.0)

A best-practices review of the whole codebase, focused on three requested areas —
embedded strings/values that should be constants, CSS/selector parameterization,
and JSON read/write validation — plus general robustness. **No changes have been
made**; this document is the deliverable. Items are grouped by priority, each with
file references and a concrete recommendation.

Overall: the architecture is in good shape. The pure-domain core, zod-validated
reads with quarantine + backup recovery, atomic writes, and centralized color maps
are all working as designed. The findings below are almost entirely about
**asymmetries** — reads are validated but writes are not; a token layer exists but
some literals bypass it; constants exist but some call sites re-inline them.

---

## P1 — Robustness of the JSON write path (do these first)

The load path is genuinely robust (zod + `.catch()` defaults per field, corrupt-file
quarantine, restore from newest backup, all tested). The save path has none of that.

### 1.1 HIGH — Writes are never validated; one bad payload can cascade into data loss

> **Status: DONE** — implemented as `shared/schema/write-guard.ts` +
> `StorageService.savePayload` (schema gate, shrink tripwire with cascade/last-item
> exemptions, `replaceAll` flag from clearAll/replaceWorkspace, rejections toasted
> in the renderer).

- `src/main/ipc.ts:48–53` — the `workspaceSave` handler forwards each collection to
  `storage.scheduleSave(name, data)` guarded only by `data !== undefined`.
- `src/main/services/storage-service.ts:101–119` — `scheduleSave`/`flushOne` serialize
  `data: unknown` straight to disk.

**Failure scenario:** a renderer bug sends `projects: []` (or `null`). The empty array
is _valid_ JSON and valid per `projectsFileSchema`, so it overwrites `projects.json`.
On the next launch, `normalizeWorkspace` drops every task and file as orphans of the
now-missing projects — a full workspace wipe triggered by one bad write, survivable
only via backups.

**Recommendation:**

1. Validate each collection against its zod schema (`projectsFileSchema`,
   `tasksFileSchema`, `filesFileSchema`, `settingsSchema`) in the IPC handler before
   scheduling the save; reject (and log) invalid payloads instead of persisting them.
2. Add a tripwire for catastrophic shrinkage: refuse (or require an explicit flag) to
   overwrite a non-empty `projects.json`/`tasks.json` with an empty array outside of
   the known clear-all/import flows. `clearAll` and import can pass an explicit
   "intentional replacement" signal through the IPC payload.
3. Add tests at the storage-service/IPC layer for both.

### 1.2 HIGH — Debounced autosave failures are silently swallowed

> **Status: DONE** — `flushOne` now catches write failures, keeps the data
> pending (15s retry; newer saves supersede), and emits a `SaveStatusEvent`
> that the main bootstrap logs and pushes to the renderer
> (`storage:saveStatus`), which shows a persistent `role="alert"` banner until
> a write succeeds. Quit logs any collections that still couldn't be written.
> Verified end-to-end against the built app (read-only data dir → banner;
> healed dir → banner clears).

- `src/main/services/storage-service.ts:104–106` — the debounce timer does
  `void this.flushOne(name)`; a rejected `atomicWrite` (disk full, permissions,
  folder deleted — plausible given the user-configurable, possibly-synced data dir)
  is an unhandled rejection. No log, no toast, and the `workspaceSave` IPC handler
  resolves before the write even runs.

**Failure scenario:** the disk fills mid-session; every autosave fails silently while
the user keeps editing. Only the quit-time `flushAll` is wrapped in a logging
try/catch (`src/main/index.ts:147`).

**Recommendation:** catch in `flushOne`, log via the existing Logger, and surface a
persistent renderer notification ("Changes are not being saved — …") via a
main→renderer event (new IPC channel, e.g. `storage:writeError`). This is the single
highest-value reliability fix in the review.

### 1.3 MED — Only the first load warning is shown, transiently

- `src/renderer/App.tsx:76` — `showToast(warnings[0] ?? '')`. If two documents were
  quarantined/restored, the second is never seen; a 2.6-second toast is easy to miss
  for a "your tasks.json was restored from backup" message.

**Recommendation:** show all load warnings, and use a dismissable banner (not a
toast) when any warning mentions quarantine/restore.

### 1.4 MED — Unguarded `response.json()` in TodoistService + missing catch in `runTodoistSync`

- `src/main/services/todoist-service.ts:163, 245, 295, 348` — `await response.json()`
  is outside try/catch. An HTTP 200 with a non-JSON body (captive portal, proxy)
  throws, the IPC call rejects…
- `src/renderer/app/store.ts` — `runTodoistSync` has `try/finally` but no `catch`, so
  that rejection produces no toast and an unhandled rejection (the sync guard flag
  does reset via `finally`). Same exposure for `todoistPush` callers in
  `Settings.tsx` / `TaskModal.tsx` (`.then()` with no `.catch()`).

**Recommendation:** wrap the body parses in the service (map to the existing
`'Unexpected response from Todoist'` error), and add `catch` → toast in
`runTodoistSync` and the two push call sites as a second line of defense.

### 1.5 MED — `config.json` is the one persisted document with no schema

- `src/main/services/config-service.ts:28–41` — only `dataDir` is manually checked;
  `windowBounds` flows unvalidated into `new BrowserWindow(...)`
  (`src/main/index.ts:47–54`). A hand-edited or corrupt config (`width: "big"`,
  negative coords) reaches Electron directly. The `save()` call in the window-close
  handler is also uncaught.

**Recommendation:** add a small zod `appConfigSchema` (with `.catch()` defaults,
matching the workspace pattern), clamp bounds to sane minimums, and try/catch the
close-time save.

### 1.6 LOW — Silent failure of scheduled backups; ad-hoc settings re-parse

- `src/main/services/backup-service.ts:65–67` and `src/main/index.ts:109–116` ignore
  the `BackupResult` from startup/hourly backups; a persistently failing daily backup
  is invisible until quit. Recommendation: log failures and count consecutive ones —
  toast the renderer after N failures.
- `backup-service.ts:44–53` re-reads `settings.json` with its own hand-rolled
  validator and its own copy of the keep-clamp (drift risk with `settingsSchema`).
  Recommendation: parse via `settingsSchema` (or share one helper).
- `storage-service.ts:67–74` — a `workspace.json` that parses but fails
  `workspaceMetaSchema` is silently ignored (no warning). Minor: append a warning.

---

## P2 — Embedded strings & values that should be constants

Existing good practice to extend: `TASK_STATUSES`, `BACKUP_KEEP_MAX`,
`TODOIST_SYNC_LOOKBACK_DAYS`, `AI_MODEL`, `API_BASE` are single-sourced. The items
below are the stragglers.

### 2.1 The "closed status" check is re-inlined ~6× despite an existing helper

`t.status === 'Done' || t.status === 'Dropped'` appears in
`src/renderer/modals/TaskModal.tsx:65`, `src/renderer/components/TaskRow.tsx:23`,
`src/shared/domain/todoist.ts:58, 139, 174` — while `isOpen()` already exists in
`src/shared/domain/derive.ts:11`. **Recommendation:** export `isClosed`
(= `!isOpen`) from `derive.ts` and use it everywhere; same for the
`!== 'Dropped'` "counts toward totals" variant repeated in `ProjectCard.tsx:37`,
`ProjectDetail.tsx:44–45,139`, `derive.ts:82`, `dep-graph.ts:42`, `calendar.ts:63`
(e.g. `isCounted()`).

### 2.2 Enum lists duplicated between `types.ts` and the zod schemas

- `TODOIST_SYNC_CHOICES` (`types.ts`) vs `z.enum(['manual','hourly','daily'])`
  (`workspace-schema.ts:74`) — derive the schema from the constant:
  `z.enum(TODOIST_SYNC_CHOICES)`.
- `FileKind` union (`types.ts:32`) vs `z.enum(['markdown','file','ref'])`
  (`workspace-schema.ts:65`) — add a `FILE_KINDS` const array (the `TASK_STATUSES`
  pattern) and derive both.

### 2.3 Numeric ranges duplicated between constants, schema, and UI

- **Push window 1–60, default 7** has _no_ named constants: literals live in
  `types.ts:125,137`, `workspace-schema.ts:85–88`, `Settings.tsx` (`?? 7`, JSX
  `min`/`max`). Add `TODOIST_PUSH_DAYS_{MIN,MAX,DEFAULT}` and use them in all three
  layers.
- **Backup keep 1–100** has constants (`BACKUP_KEEP_DEFAULT/MAX`) but
  `workspace-schema.ts:79–82` re-inlines `100`/`10`/`1`, and `Settings.tsx` re-inlines
  `?? 10`. Add `BACKUP_KEEP_MIN`, and make the schema use the constants.

### 2.4 Duplicated user-facing strings

- `'Add your Todoist API token first'` — `todoist-service.ts:138, 222` **and**
  `store.ts` (renderer). Move to a shared constant (e.g. in
  `shared/domain/todoist.ts`) so the copy can't drift across the process boundary.
- `'Could not reach Todoist — check your connection'` ×3 and the
  `` `Todoist error (HTTP …)` `` template ×2 inside `todoist-service.ts` —
  module-level constants/helper.
- `'Untitled task'` ×6 (`TaskModal.tsx:308`, `TaskRow.tsx:55`, `reports.ts:290`,
  `todoist.ts:117`, `ai-import.ts:127`, `workspace-schema.ts:62`) and the
  `'Untitled'`/`'Untitled project'` variants (`mutate.ts:253,258`, `Calendar.tsx`,
  `DependencyMap.tsx`) — add `UNTITLED_TASK` / `UNTITLED_PROJECT` to `types.ts`.

### 2.5 Time-unit and pagination magic numbers

- `3_600_000` / `86_400_000` in `todoist.ts:77`, `86_400_000` again in `store.ts` and
  `dates.ts:42`, and `60 * 60 * 1000` in `main/index.ts:114` — add `MS_PER_HOUR` /
  `MS_PER_DAY` (natural home: `shared/domain/dates.ts`).
- `PAGE_LIMIT`/`MAX_PAGES` exist in `todoist-service.ts:16,18` but `pushTasks`
  re-inlines `50` and `limit=200` (`:230,232`) — reuse the constants.
- The Settings copy hardcodes "last 30 days" (`Settings.tsx:419`) while
  `TODOIST_SYNC_LOOKBACK_DAYS` exists — interpolate the constant so UI copy can't
  drift from behavior.
- Lone unnamed timers worth naming in place (low): toast dismiss `2600`
  (`store.ts`), `60_000` minute tick ×2 (`App.tsx`), storage debounce `300`,
  CSV preview row cap `300` (`FileViewerModal.tsx:36`).

### 2.6 Small ones

- `'imported'` tag literal ×2 in `ai-import.ts:110,130` → `IMPORTED_TAG`.
- `'ariadne'` push label (`todoist.ts:122`) → named constant next to
  `todoistLabelFor`.
- Window defaults `1440`/`900` and `backgroundColor: '#f6f6f4'`
  (`main/index.ts:49–56`) — the hex duplicates `--bg` in `tokens.css`; at minimum add
  a comment cross-referencing the token (main process can't read CSS vars).

---

## P3 — CSS & styling parameterization

A real token layer exists (`styles/tokens.css` `:root`, heavily used) and semantic
maps are centralized (`styles/colors.ts`: `STATUS_COLORS`, `PRIORITY_COLORS`,
`CATEGORY_COLORS`). The problems are literals that bypass them.

### 3.1 TSX palettes that duplicate existing tokens (highest value)

Changing the palette today would require edits in ~6 files. These literals duplicate
`tokens.css`/`colors.ts` values:

- `src/shared/domain/derive.ts:93–97` — due-date colors (`#d94c3a`, `#c23b2b`,
  `#a8710f`, `#73736c`, `#9a9a92`) duplicate `--danger-dot`, `--danger-text`,
  `--warn-text`, `--muted`, `--faint`. **Caveat:** `shared/` must stay
  dependency-free — the fix is to return semantic _names_ (`'overdue' | 'today' |
'soon' | …`) from the domain and map name→color in `styles/colors.ts`, not to
  import renderer code into `shared/`.
- `src/renderer/components/FileRow.tsx:7–20` — `BADGE_COLORS` (12 hexes, several
  duplicating tokens) + `#8a8a82` fallback → move to `colors.ts`.
- `src/renderer/components/ProjectCard.tsx:21–30` — a second status→color map and the
  `DUE_LEVELS` gradient parallel to `STATUS_COLORS` → consolidate into `colors.ts`.
- Scattered repeats of `#d94c3a`/`#c23b2b`/`#4f5bd5`/`#2f8552` in
  `CommandCenter.tsx`, `Reports.tsx`, `TopBar.tsx`, `Logo.tsx` → import from
  `colors.ts`.

### 3.2 app.css literals that bypass the token layer

- Exact token values re-typed as literals (drift waiting to happen): `#1b1b18`
  (=`--text`, app.css:704), `#c23b2b` (=`--danger-text`, :1894), `#2f8552`
  (=`--ok-text`, :2219), `rgba(20,20,15,0.06)` (=`--border2`, :176,333,1333),
  `rgba(20,20,15,0.1)` (=`--border`, :1477). Mechanical replacement with `var(…)`.
- Recurring values with no token yet: `#f0f0ee` ×5 (also `STATUS_COLORS.Dropped.bg`)
  → new `--neutral-fill`; `#f5f6fe` ×3 → `--accent-tint`; `rgba(20,20,15,0.08)` ×4 →
  `--border3`; `#fff` on-accent text ×3 → `--on-accent`.
- Optional/larger: no radius or spacing scale exists (`border-radius: 8px` ×16, etc.).
  Worthwhile only if done as a one-time mechanical sweep; low urgency.

### 3.3 Inline styles that belong in CSS classes

Every view repeats `className="view-wrap fadein"` plus a _divergent inline_
`maxWidth` (720/820/900/1180 across 8 views). Recommendation: a `PageWrap`
component or `view-wrap--narrow/wide` modifier classes; kills both the string
duplication and the inline literals. Also: `display:'none'` on hidden file inputs
(`TaskModal.tsx:346`, `ProjectDetail.tsx:218`) → a utility class; `ErrorBoundary`
typography block; dot sizes (6/7/8px) passed inline to `Dot` in several places.
(Data-driven inline styles — `background: st.dot`, percentage bars — are fine.)

---

## P4 — Test & E2E selector robustness

- `Settings.test.tsx:102,116` — `getByRole('alertdialog').querySelector('.btn.danger')`.
  The accessible-name query (`getByRole('button', { name: 'Delete' })`) already works
  and is used in E2E; swap it in. Clearest fix in this section.
- Class-coupled queries in `ProjectCard.test.tsx` (`.status-strip-seg`,
  `.pc-spark-bar`, …), `ProjectDetail.test.tsx` (`.trow`), `Reports.test.tsx`
  (`.report-line`), `DependencyMap.test.tsx` (`g.dep-node`), and E2E
  (`win.locator('.trow')`, `.tag-manage-row`). For visualization internals,
  class selectors are semi-legitimate (there's no role), but adding
  `data-testid`s to the strip/spark/due-cell elements would decouple tests from
  styling class names.
- E2E asserts exact copy strings ("5 tasks need your attention today",
  "You are all caught up. 🎉"). Acceptable while copy is stable; prefer testids +
  regex where already available.
- Coverage note: the Todoist completion sync has unit coverage at every layer but no
  E2E (would need network stubbing in the main process). Current stance is
  reasonable; noting for completeness. Live-token verification remains Mac-only.

---

## Suggested sequencing

| Order | Item                                                           | Scope                               | Why first                                     |
| ----- | -------------------------------------------------------------- | ----------------------------------- | --------------------------------------------- |
| 1     | 1.1 write-path validation + shrink tripwire                    | ipc.ts, storage-service + tests     | Only finding with a data-loss path            |
| 2     | 1.2 surface autosave failures                                  | storage-service, new IPC event, App | Silent-failure mode; user trusts autosave     |
| 3     | 1.4 Todoist `response.json()` guards + missing catches         | todoist-service, store, 2 views     | Cheap; closes the unhandled-rejection path    |
| 4     | 1.3 warnings banner, 1.5 config schema                         | App.tsx, config-service             | Small, contained                              |
| 5     | P2 constants pass                                              | mostly `shared/`, Settings          | Mechanical; do as one commit with tests green |
| 6     | P3.1 + P3.2 color consolidation                                | colors.ts, tokens.css, ~6 tsx       | Mechanical; verify with a screenshot pass     |
| 7     | P4 selector cleanup, P3.3 PageWrap, 1.6, radius/spacing tokens | tests, css                          | Nice-to-have                                  |

Items 1–4 are the "robust, reliable" payload; each should land with the usual gate
(failing test first where possible — 1.1 and 1.2 are very testable). Items 5–7 are
maintainability and can be batched opportunistically.
