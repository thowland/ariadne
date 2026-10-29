import type { IsoDate, TaskPriority, TaskStatus } from '../types';

import { isValidIsoDate } from './dates';

/**
 * Microsoft Project → Ariadne project document (D53). Pure: it takes JSON a
 * converter wrote from an `.mpp` file and returns the `{ project, tasks }`
 * shape the single-project import (D52) already reads, so validation, fresh
 * ids and dependency checks stay in one place.
 *
 * The expected source is MPXJ, which is what Python, Java and .NET converters
 * of `.mpp` files almost always use, but field names are matched loosely —
 * `unique_id`, `UniqueID`, `uniqueId` and `Unique ID` are the same key — so a
 * hand-rolled script that renamed things on the way out still reads.
 *
 * What maps where:
 * - The project's name comes from the project properties, else the outline-
 *   level-0 "project summary" task MS Project keeps, else the file's `name`.
 * - Summary tasks (phases) are not tasks here. Each becomes a tag, slugged,
 *   on every task beneath it, so a phase can still be filtered on.
 * - Finish → due date. 100% complete (or an actual finish) → Done, completed on
 *   the actual finish; any progress (or an actual start) → Doing; else Todo.
 * - MS Project's 0–1000 priority → Critical (≥900), High (≥600), Medium
 *   (≥400), Low.
 * - Predecessors → "Blocked by", matched on unique id and then on row id. A
 *   link to a summary task is dropped, because a phase is not a task here.
 * - Milestones get a `milestone` tag; notes carry over.
 * Resources, assignments, baselines, costs and calendars have no home in
 * Ariadne and are ignored.
 */

export interface MsProjectConversion {
  /** `{ project, tasks }`, ready for `parseProjectImport`'s own checks. */
  doc: { project: Record<string, unknown>; tasks: Record<string, unknown>[] };
  warnings: string[];
}

type Rec = Record<string, unknown>;

function asRec(v: unknown): Rec | null {
  return typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Rec) : null;
}

/** `unique_id`, `UniqueID`, `uniqueId` and `Unique ID` all become `uniqueid`. */
function keyOf(k: string): string {
  return k.toLowerCase().replace(/[\s_-]/g, '');
}

/** The first of `names` present on `r` with a non-null value, matched loosely. */
function field(r: Rec, ...names: string[]): unknown {
  const wanted = names.map(keyOf);
  for (const want of wanted) {
    for (const [k, v] of Object.entries(r)) {
      if (keyOf(k) === want && v !== null && v !== undefined && v !== '') return v;
    }
  }
  return undefined;
}

function text(v: unknown): string {
  return typeof v === 'string' ? v.trim() : typeof v === 'number' ? String(v) : '';
}

function num(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') {
    const n = parseFloat(v.replace('%', ''));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function bool(v: unknown): boolean {
  return v === true || v === 1 || (typeof v === 'string' && /^(true|yes|1)$/i.test(v.trim()));
}

/** Integer id as a string key, or null; accepts 7, "7" and 7.0. */
function idKey(v: unknown): string | null {
  const n = num(v);
  return n === null || !Number.isInteger(n) ? null : String(n);
}

/**
 * The calendar date of an MS Project timestamp. Takes the date part of an
 * ISO-style value ("2026-03-02T08:00:00.0"), or a US "3/2/2026" (with or
 * without a weekday in front, as Project prints them). Never consults the
 * clock or the time zone: the date written is the date meant.
 */
export function msDate(v: unknown): IsoDate | null {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  const iso = /^(\d{4}-\d{2}-\d{2})/.exec(s);
  if (iso?.[1] !== undefined && isValidIsoDate(iso[1])) return iso[1];
  const us = /(?:^|\s)(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})(?:\s|$)/.exec(s);
  if (us === null) return null;
  const [, m = '', d = '', y = ''] = us;
  const year = y.length === 2 ? `20${y}` : y;
  const out = `${year}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  return isValidIsoDate(out) ? out : null;
}

export function msPriority(v: unknown): TaskPriority {
  const n = num(v);
  if (n !== null) {
    if (n >= 900) return 'Critical';
    if (n >= 600) return 'High';
    if (n >= 400) return 'Medium';
    return 'Low';
  }
  // MPXJ can also write the enum name: HIGHEST, VERY_HIGH, LOW, …
  const s = text(v).toUpperCase();
  if (s === 'HIGHEST' || s === 'DO_NOT_LEVEL') return 'Critical';
  if (s.includes('HIGH')) return 'High';
  if (s.includes('LOW')) return 'Low';
  return 'Medium';
}

function slug(name: string): string {
  return name.trim().replace(/^#+/, '').toLowerCase().replace(/\s+/g, '-');
}

/**
 * Ids a predecessor entry points at, in any of the shapes converters use.
 * `byRow` is set for text like "12FS+2d", which is how Project's own
 * Predecessors column reads — and that column counts rows, not unique ids.
 */
function predecessorRefs(v: unknown): { ref: string; byRow: boolean }[] {
  const list: unknown[] = Array.isArray(v)
    ? (v as unknown[])
    : typeof v === 'string'
      ? v.split(/[,;]/)
      : v === undefined
        ? []
        : [v];
  const refs: { ref: string; byRow: boolean }[] = [];
  for (const item of list) {
    const r = asRec(item);
    if (r !== null) {
      const id = idKey(
        field(
          r,
          'predecessor_task_unique_id',
          'predecessor_unique_id',
          'predecessor_uid',
          'task_unique_id',
          'unique_id',
          'uid',
          'predecessor_task_id',
          'predecessor_id',
          'task_id',
          'id',
        ),
      );
      if (id !== null) refs.push({ ref: id, byRow: false });
      continue;
    }
    // "12", "12FS", "12FS+2d" — the leading number is the task.
    const m = /^\s*(\d+)/.exec(text(item));
    if (m?.[1] !== undefined) refs.push({ ref: m[1], byRow: typeof item === 'string' });
  }
  return refs;
}

/** Where the task list lives: `tasks`, `Tasks`, or `project.tasks`. */
function taskList(doc: Rec): unknown[] | null {
  const direct = field(doc, 'tasks');
  if (Array.isArray(direct)) return direct as unknown[];
  const inner = asRec(field(doc, 'project'));
  const nested = inner === null ? undefined : field(inner, 'tasks');
  return Array.isArray(nested) ? (nested as unknown[]) : null;
}

/** Keys only MS Project's task model has; Ariadne's own tasks have none. */
const MS_TASK_KEYS = [
  'uniqueid',
  'uid',
  'outlinelevel',
  'outlinenumber',
  'wbs',
  'percentcomplete',
  'start',
  'finish',
  'summary',
  'parenttaskuniqueid',
  'predecessors',
  'milestone',
].map(keyOf);

/**
 * True when a document looks like an MS Project conversion rather than one of
 * D52's own shapes: its tasks carry MS Project fields (unique ids, outline
 * levels, start/finish, percent complete) and none uses Ariadne's `title`.
 */
export function isMsProjectDocument(doc: Rec): boolean {
  if (Array.isArray(doc.projects)) return false;
  const tasks = taskList(doc);
  if (tasks === null || tasks.length === 0) return false;
  let ms = 0;
  for (const t of tasks) {
    const r = asRec(t);
    if (r === null) continue;
    if ('title' in r) return false;
    if (Object.keys(r).some((k) => MS_TASK_KEYS.includes(keyOf(k)))) ms += 1;
  }
  return ms > 0;
}

interface Row {
  uid: string;
  rowId: string | null;
  name: string;
  level: number | null;
  parent: string | null;
  summary: boolean;
  raw: Rec;
}

export function convertMsProject(doc: Rec, today: IsoDate): MsProjectConversion {
  const warnings: string[] = [];
  const rows: Row[] = [];
  (taskList(doc) ?? []).forEach((t, i) => {
    const r = asRec(t);
    if (r === null) return;
    const uid = idKey(field(r, 'unique_id', 'uid', 'guid')) ?? `row${String(i)}`;
    const levelRaw = num(field(r, 'outline_level', 'level'));
    rows.push({
      uid,
      rowId: idKey(field(r, 'id', 'row_id', 'task_id')),
      name: text(field(r, 'name', 'task_name', 'title')),
      level: levelRaw,
      parent: idKey(
        field(r, 'parent_task_unique_id', 'parent_unique_id', 'parent_uid', 'parent_id'),
      ),
      summary: bool(field(r, 'summary', 'is_summary')),
      raw: r,
    });
  });

  // Parents: as written, else from the outline levels in row order.
  if (rows.every((r) => r.parent === null) && rows.some((r) => r.level !== null)) {
    const stack: Row[] = [];
    for (const row of rows) {
      const level = row.level ?? 1;
      while (stack.length > 0 && (stack[stack.length - 1]?.level ?? 1) >= level) stack.pop();
      row.parent = stack.at(-1)?.uid ?? null;
      stack.push(row);
    }
  }
  const byUid = new Map(rows.map((r) => [r.uid, r]));
  const hasChildren = new Set(rows.flatMap((r) => (r.parent === null ? [] : [r.parent])));

  // The outline-level-0 row is MS Project's whole-project summary.
  const root = rows.find((r) => r.level === 0) ?? null;
  const props = asRec(field(doc, 'property_values', 'project_properties', 'properties', 'project'));
  const projectName =
    text(props === null ? undefined : field(props, 'project_title', 'title', 'name')) ||
    (root?.name ?? '') ||
    text(field(doc, 'name', 'project_name', 'title')) ||
    'Imported MS Project';

  const isPhase = (r: Row): boolean => r !== root && (r.summary || hasChildren.has(r.uid));
  const leaves = rows.filter((r) => r !== root && !isPhase(r) && r.name !== '');
  const blank = rows.filter((r) => r !== root && !isPhase(r) && r.name === '').length;
  const phases = rows.filter(isPhase);

  const byRowId = new Map(rows.flatMap((r) => (r.rowId === null ? [] : [[r.rowId, r] as const])));
  const leafIds = new Set(leaves.map((r) => r.uid));
  let droppedLinks = 0;

  const tasks = leaves.map((row): Rec => {
    const r = row.raw;
    const tags: string[] = [];
    // Every phase above the task, outermost first.
    const chain: string[] = [];
    const seen = new Set<string>();
    for (let p = row.parent; p !== null && !seen.has(p); p = byUid.get(p)?.parent ?? null) {
      seen.add(p);
      const parent = byUid.get(p);
      if (parent === undefined || parent === root) break;
      if (parent.name !== '') chain.unshift(slug(parent.name));
    }
    tags.push(...chain);
    if (bool(field(r, 'milestone'))) tags.push('milestone');

    const pct = num(field(r, 'percent_complete', 'percentcomplete', 'complete', 'progress')) ?? 0;
    const actualFinish = msDate(field(r, 'actual_finish'));
    const actualStart = msDate(field(r, 'actual_start'));
    const finish = msDate(field(r, 'finish', 'end', 'finish_date', 'due', 'deadline'));
    let status: TaskStatus = 'Todo';
    if (pct >= 100 || actualFinish !== null) status = 'Done';
    else if (pct > 0 || actualStart !== null) status = 'Doing';

    const dependsOn: string[] = [];
    for (const { ref, byRow } of predecessorRefs(field(r, 'predecessors', 'predecessor'))) {
      const target = byRow
        ? (byRowId.get(ref) ?? byUid.get(ref))
        : (byUid.get(ref) ?? byRowId.get(ref));
      if (target !== undefined && leafIds.has(target.uid) && target.uid !== row.uid) {
        if (!dependsOn.includes(target.uid)) dependsOn.push(target.uid);
      } else {
        droppedLinks += 1;
      }
    }

    const created = msDate(field(r, 'created', 'creation_date'));
    const out: Rec = {
      id: row.uid,
      title: row.name,
      status,
      priority: msPriority(field(r, 'priority')),
      tags: [...new Set(tags)],
      notes: text(field(r, 'notes', 'note', 'comments')),
      dueDate: finish,
      dependsOn,
      completedAt: status === 'Done' ? (actualFinish ?? finish ?? today) : null,
    };
    if (created !== null) out.createdAt = created;
    return out;
  });

  if (phases.length > 0) {
    warnings.push(
      `${String(phases.length)} summary task${phases.length === 1 ? '' : 's'} became tags`,
    );
  }
  if (blank > 0) warnings.push(`${String(blank)} blank row${blank === 1 ? '' : 's'} skipped`);
  if (droppedLinks > 0) {
    warnings.push(
      `${String(droppedLinks)} link${droppedLinks === 1 ? '' : 's'} to a summary or missing task dropped`,
    );
  }

  const notes = text(
    props === null ? undefined : field(props, 'comments', 'notes', 'subject', 'description'),
  );
  return { doc: { project: { name: projectName, notes }, tasks }, warnings };
}
