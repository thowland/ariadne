# Handoff: Ariadne — Personal Project & Task Tracker

## Overview
Ariadne is a single-user, information-dense web app for tracking many long-running
projects at once. It combines a daily-review "command center," per-project workspaces
(notes, links, a document library, tasks, and a dependency graph), a calendar, and a
reporting surface for status roll-ups to management. It is designed to run locally with a
simple login gate and browser-local persistence. Name/metaphor: *Ariadne's thread* — the
line that guides you through the labyrinth of long-running work.

## About the Design Files
The files in this bundle are **design references created in HTML** — a working prototype
that demonstrates the intended look, layout, interactions, and data model. They are **not
production code to copy directly**.

The prototype is authored as a "Design Component" (`.dc.html`) that runs on a small
bundled runtime (`support.js`) — that runtime is an authoring convenience, **not** part of
the intended production stack. Your task is to **recreate these designs in the target
codebase's own environment** (e.g. React + your component library, Vue, SwiftUI, etc.)
using its established patterns, and to back it with a **real persistence layer / API**
instead of browser localStorage. If no codebase exists yet, choose an appropriate stack
(a React SPA + a small backend, or a local-first app such as Tauri/Electron, fits the
"run it locally" goal well).

Two files are included:
- `Throughline.dc.html` — the full annotated source of the prototype (all view logic,
  data model, and rendering live in one class). **This is the source of truth** for
  behavior and exact values.
- `Ariadne.html` — a self-contained, offline-runnable build of the same prototype. Open it
  in any browser to click through the real thing (login: `admin` / `admin`).

## Fidelity
**High-fidelity (hifi).** Colors, typography, spacing, and interactions are final and
intended to be recreated faithfully. Where this document and the source disagree, the
source wins.

## Product Requirements (origin)
Captured from the requesting user, for context:
- 10–20 concurrently active projects, each lasting 12+ months, 1–50 tracked tasks each.
- Both **work** and **home** projects; reports must be filterable by category/tag so work
  reports never expose personal projects (and vice-versa).
- Tasks need: status, optional due date, optional predecessor/dependency mapping, priority,
  tags, free-text notes, subtasks, and attachments/links. System should stay free-form.
- Per-project collection of notes, documents, and links (a real document library).
- Import/export (JSON). Desired future: sync with the **Todoist** API for mobile capture
  (prototype includes a mocked sync only — see Integrations).
- A daily "review everything due" surface, plus an ambient reminder of overdue / critical
  upcoming work.
- Single user, run locally, with a simple userid/password gate to prevent accidental
  tampering (not a hardened security boundary).

---

## Data Model

### Project
```
{
  id: string,                 // e.g. "p1"
  name: string,
  category: "work" | "home",  // drives report scoping and the Work/Home filter
  tags: string[],             // free-form, e.g. ["infra","q3"]
  color: string,              // hex; used for the project dot and progress bar
  status: string,             // "Active" (free-form; not heavily used yet)
  notes: string,              // free-text project notes (plain text in prototype)
  links: { title: string, url: string }[],
  docs:  { name: string, note: string }[],  // LEGACY — migrated into files[] as kind:"ref"
  createdAt: string           // ISO "YYYY-MM-DD"
}
```

### Task
```
{
  id: string,
  projectId: string,
  title: string,
  status: "Todo" | "Doing" | "Waiting" | "Done" | "Dropped",
  priority: "Critical" | "High" | "Medium" | "Low",
  tags: string[],
  notes: string,
  dueDate: string | null,     // ISO "YYYY-MM-DD"
  dependsOn: string[],        // task ids this task is "Blocked by"
  subtasks: { title: string, done: boolean }[],
  links: { title: string, url: string }[],
  createdAt: string,
  completedAt: string | null  // set to today when status -> Done; cleared otherwise
}
```

### File (document library)
```
{
  id: string,
  projectId: string,
  taskId: string | null,      // if set, also surfaces on that task as an attachment
  name: string,               // e.g. "Rollback plan.md"
  ext: string,                // "md","pdf","csv","docx","xlsx","pptx","rtf","png"...
  mime: string,
  kind: "markdown" | "file" | "ref",
  size: number,               // bytes (0 for markdown/ref)
  note?: string,              // for kind:"ref" pointers
  content: string,            // markdown text (kind:"markdown" only)
  createdAt: string
}
// Binary file bytes are stored OUT of the main object as data URLs keyed by file id
// (prototype: localStorage "throughline.blobs.v1"). In production use object storage /
// a files table + signed URLs; do NOT base64 blobs into your primary record.
```

### Settings
```
{ todoistToken: string }
```

### Derived values (computed, not stored)
- **isBlocked(task)**: task is not Done/Dropped AND any `dependsOn` task is not Done/Dropped.
- **Overdue**: open task with `dueDate < today`.
- **Project progress**: `done / (total excluding Dropped)`.
- **relative due label**: `<n>d overdue` / `Today` / `Tomorrow` / `in <n>d` (≤7) / `Mon D`.

> The prototype pins "today" to **2026-07-08** for stable demo data (`TODAY` constant).
> Production must use the real current date.

---

## Screens / Views

Global chrome: a fixed **250px left sidebar** (brand, primary nav, project list, user +
sign-out) and a **top bar** (view title + long date, an overdue pill, a search box, and a
primary "+ New task" button). Main content scrolls independently; content is centered with
`max-width: ~1180–1200px`.

### 1. Login
- **Purpose**: Gate the workspace (prevent accidental edits by others on the machine).
- **Layout**: Centered card (max-width 378px) on a soft radial-gradient background; brand
  lockup above the card; helper line below.
- **Components**: Brand mark + "Ariadne"; card with "Welcome back" (19px/700), subtitle,
  Username + Password inputs, full-width primary "Sign in" button, demo-credentials hint.
- **Behavior**: Enter submits. Validates non-empty; checks against stored credentials
  (default `admin`/`admin`); inline error on mismatch. On success, sets `authed` (session
  only — not persisted, so login recurs each visit; data persists).

### 2. Command Center (home / "Daily Review")
- **Purpose**: The first thing seen each day — what needs attention now, across all projects.
- **Layout**: Header row (eyebrow "DAILY REVIEW · <date>" + dynamic H1 like "N tasks need
  your attention today"; a Work/Home/All segmented control on the right). A row of 4 stat
  cards (Open tasks, Due this week, Overdue, Active projects). An ambient banner (only when
  overdue or critical-due-today exists). Then a two-column grid:
  `minmax(0,1.35fr)` **Focus** column + `minmax(0,1fr)` **Portfolio** column.
- **Focus column**: Stacked cards, each shown only when non-empty: *Overdue* (red), *Due
  today* (red), *Blocked* (amber), *Due this week* (indigo), *High priority · later*
  (amber). Each lists task rows.
- **Portfolio column**: "Portfolio" heading with count + "+ Project"; then a project card per
  project (name + color dot, Work/Home pill, progress bar, "N open / X/Y done", overdue
  count in red, next-due label). Cards are clickable → project view.
- **Scope filter** (`scope` = all/work/home) filters every list here and on the Calendar.

### 3. Calendar
- **Purpose**: See due dates laid out in time.
- **Layout**: Header (month name + ‹ / Today / › + Work/Home/All). Two-column grid: a month
  grid (`minmax(0,1fr)`) + a 300px "Upcoming" list.
- **Month grid**: 7-column weekday header; day cells min-height ~96px; today tinted; each
  cell shows up to 4 task chips (priority-colored, click → task) then "+N more".
- **Upcoming**: next open due tasks, task rows, click → task.

### 4. Project detail
- **Purpose**: The workspace for one project.
- **Layout**: Header (color dot + editable name input, Work/Home select, "X / Y done", tag
  editor, "+ Add task" + "Delete" on the right). Two-column grid:
  `minmax(0,1fr)` main + 340px side.
  - **Main**: *Tasks* card (sorted Doing→Todo→Waiting→Done→Dropped, then by due; each a task
    row; inline "Add a task and press Enter" input + Add button). Below it, *Dependency map*
    card.
  - **Side**: *Notes* (textarea), *Links* (inline editable title/url list + "Add link"),
    *Files & documents* (the library — see below).

### 5. Dependency map
- **Purpose**: Visualize task predecessor chains within a project.
- **Layout**: An SVG directed graph. Tasks are placed in **layers by dependency depth**
  (longest-path from roots). **Vertical orientation**: each layer is a horizontal row,
  layers stack top→bottom, nodes in a layer are centered and spread horizontally; edges flow
  downward with arrowheads. Long chains grow downward (scroll), not sideways.
- **Nodes**: rounded rect (~172×54), status-colored border + status dot + status label + a
  truncated title. Click a node → opens that task.
- **Empty state** (fewer than 2 tasks or no dependencies): a hint to add "Blocked by" links.

### 6. Task detail (modal)
- **Purpose**: Edit every field of a task.
- **Layout**: Centered overlay panel (max-width 660px, scrolls). Sticky header: a status
  toggle circle, an auto-growing title textarea, close ×. Body sections: a 2×2 grid
  (Project select, Due date, Status select, Priority select); Tags editor; Notes textarea;
  Subtasks (checkbox list + add); **Blocked by** (checkbox list of sibling tasks with their
  status); **Attachments** (files with this task's id — add markdown or upload); Links
  (inline editable). Footer: "Delete task" (danger) + "Done".
- **Behavior**: All edits auto-save immediately (no explicit save). Status toggle cycles
  Todo→Doing→Waiting→Done. Escape or backdrop click closes.

### 7. Document library + file viewer (modal)
- **Purpose**: Per-project store for reference material; task attachments also surface here.
- **Library card**: header with count + "+ Markdown" and "Upload"; rows show a file-type
  badge, name, kind/size, and an owning-task label if attached, plus download (↓) and
  delete (×).
- **Supported uploads**: PDF, CSV, DOCX, RTF, XLSX, PPTX, images (prototype caps at 3.5 MB
  each due to localStorage; production should not).
- **File viewer** (max-width 840px overlay):
  - **Markdown**: Preview/Edit toggle. Preview renders a small subset of markdown
    (headings, bold/italic, inline code + fenced code, ordered/unordered lists, blockquote,
    hr, links). Edit is a monospace textarea; editable filename in header.
  - **PDF**: inline `<object>` preview (fallback to download).
  - **CSV**: parsed into an HTML table (first row as header).
  - **Image**: inline `<img>`.
  - **DOCX / XLSX / PPTX / RTF**: no inline preview (by design — no embedded office editor);
    shows file details + Download.
  - Every viewer has Download + Delete; opening from a task shows a "‹ Back to task" link.

### 8. Reports
- **Purpose**: Communicate status/retrospectives upward; scoped by tag so work ≠ home.
- **Controls**: report-type segmented control; a tag/scope select (All / Work only / Home
  only / each tag); a date range (retrospective only); "Copy report" (plain-text to
  clipboard).
- **Types**:
  - **Weekly status** — per project: *Done this week* (completed ≤7d ago), *Planned next*
    (open, due within 7d), *Blockers / at risk* (Waiting, blocked, or overdue).
  - **Portfolio roll-up** — table: project, type, open, done, overdue, next due.
  - **Retrospective** — count + tasks completed within the chosen date range, grouped by
    project with completion dates.
  - **At-risk** — overdue, blocked, and near-due Critical/High tasks with a reason label.

### 9. Settings
- **Account**: change username / password (stored credentials).
- **Data**: Export JSON (includes files/blobs), Import (file or pasted JSON), Reset to
  sample data, Clear all.
- **Integrations · Todoist**: API-token field + "Sync now". **Mocked** in the prototype —
  it seeds a "Todoist Inbox" project with a few demo tasks; there is **no live network
  call** (a browser prototype cannot hold a server secret or call the API cross-origin).
  Production should implement a real backend OAuth/token exchange + sync.
- **Reference**: status and priority legends.

---

## Interactions & Behavior
- **Auto-save everywhere**: editing any task/project/file field persists immediately.
- **Status toggle**: clicking a task's status circle cycles Todo→Doing→Waiting→Done (Done
  stamps `completedAt`); reopening clears it.
- **Blocked indicator**: tasks whose dependencies aren't complete show a "blocked" pill and
  appear in the Blocked focus section and at-risk report.
- **Search**: top-bar query filters projects (name/tags) and tasks (title/notes/tags) into a
  results view; clearing returns to the prior view.
- **Overdue pill** (top bar): jumps to the Command Center with All scope.
- **Navigation**: sidebar nav + project list; project cards and task/file rows open their
  detail; modals stack (file viewer remembers it came from a task).
- **Transitions**: subtle `fadein` on view mount; `overlayin` + `modalin` on modals;
  toast slides up bottom-center for ~2.6s after data actions. Hover lifts on cards, row
  tint on hover.

## State Management
Single component holds all state (prototype). In production, split into store slices:
- **auth**: `authed` (session), credentials.
- **data**: `{ projects, tasks, files, settings }` — the persisted domain model.
- **blobs**: `{ [fileId]: dataURL }` — persisted separately from `data` so editing markdown
  doesn't re-serialize megabytes of binary (mirror this separation in production: metadata
  row + blob storage).
- **navigation/UI**: `view` (home | calendar | project | reports | settings), `activeProjectId`,
  `modal` (`{type:'task'|'file', id, back?}`), `fileMode` (preview|edit), `q` (search),
  `scope` (all|work|home), `calMonth`, report `type`/`tag`/`from`/`to`, transient `toast`.
- **Persistence triggers**: every create/update/delete writes through to storage. JSON
  export = `data` + `_blobs`; import restores both.

## Design Tokens

### Color — neutrals & surfaces
- App background: `#f6f6f4`
- Surface (cards/panels): `#ffffff`; alt surface: `#fbfbfa`
- Border: `rgba(20,20,15,.10)`; subtle border: `rgba(20,20,15,.06)`
- Text: `#1b1b18`; muted: `#73736c`; faint: `#9a9a92`
- Accent (primary / brand): `#4f5bd5`; accent-soft bg: `#eef0fc`
- Selection: `#dfe2fb`

### Color — status (text `c`, bg, dot)
- Todo `#7d7d75` / `#efefec` / `#b4b4ac`
- Doing `#2f62d8` / `#e9f0fd` / `#2f62d8`
- Waiting `#a8710f` / `#faf0dc` / `#d69220`
- Done `#2f8552` / `#e7f3ec` / `#3a9a5f`
- Dropped `#9a9a92` / `#f0f0ee` / `#bdbdb5`

### Color — priority (text `c`, dot, bg)
- Critical `#c23b2b` / `#d94c3a` / `#fbeae7`
- High `#a8710f` / `#e0a020` / `#faf0dc`
- Medium `#4f5bd5` / `#6b76e0` / `#eef0fc`
- Low `#8a8a82` / `#c2c2ba` / `#f1f1ef`

### Project palette (dots / progress)
`#4f5bd5, #2f8552, #a8710f, #c23b2b, #7c4dd6, #0e8a8a, #c2569b`

### File-type badge colors
md/accent `#4f5bd5`, pdf `#c23b2b`, csv/xlsx `#2f8552`, docx `#2f62d8`, pptx `#c46a1c`,
rtf/txt `#8a8a82`, images `#7c4dd6`.

### Typography
- UI/body: **Public Sans** (Google Fonts), weights 400/500/600/700/800, with
  `system-ui, -apple-system, sans-serif` fallback. Antialiased.
- Monospace (dates, ids, badges, code, markdown editor): `ui-monospace, Menlo, monospace`.
- Scale (px): H1 hero 26 / dialog title 19–20 / view title 15 / card title 13.5 / body
  13–14 / meta 11.5–12.5 / eyebrow 11 (700, letter-spacing ~.6). Negative letter-spacing
  (~ -.4px) on large headings.

### Radius
Chips/badges pill (20) or 5–7; inputs/buttons 8–9; cards 11–12; modals 16; file/status
badge 7.

### Shadow
- Card hover: `0 8px 24px -12px rgba(20,20,15,.22)`
- Login card: `0 18px 50px -22px rgba(20,20,15,.32)`
- Modal: `0 24px 70px -20px rgba(20,20,15,.4)`
- Toast: `0 10px 30px -8px rgba(0,0,0,.4)`

### Spacing / density
Row padding ~8×10; card padding 12–20; grid gaps 12–18; sidebar 250px; side column 300–340px.

### Tweakable props (exposed in the prototype)
- `accent` (color) — primary/brand color.
- `density` — Comfortable | Compact.
- `startView` — Command Center | Calendar | Reports.

## Assets
- **Logo mark**: an Archimedean **spiral** (single stroked SVG path, ~3.1 turns winding
  inward), white on the accent-colored rounded square — "Ariadne's thread." The full path
  is in the source (search `viewBox="0 0 32 32"`). No external image assets.
- **Fonts**: Public Sans via Google Fonts (`fonts.googleapis.com`). Self-host in production.
- No icon set — nav is text; status/priority use colored dots; file types use lettered
  badges. Keep this restraint (avoid an icon-heavy redesign).

## Files
- `Throughline.dc.html` — annotated prototype source (all logic + markup). Source of truth.
- `Ariadne.html` — offline, self-contained runnable build (open in a browser; `admin`/`admin`).
- (Runtime `support.js` powers the `.dc.html` authoring format and is **not** needed to
  reimplement — ignore it for production.)
