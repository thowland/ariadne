import type { Task, TaskStatus } from '../types';

/** Ascending due date; tasks without one sort last. Stable for ties. */
export function byDue(a: Task, b: Task): number {
  const ka = a.dueDate ?? '9999-99-99';
  const kb = b.dueDate ?? '9999-99-99';
  return ka < kb ? -1 : ka > kb ? 1 : 0;
}

/** Project task list order: Doing → Todo → Waiting → Done → Dropped. */
const STATUS_ORDER: Record<TaskStatus, number> = {
  Doing: 0,
  Todo: 1,
  Waiting: 2,
  Done: 3,
  Dropped: 4,
};

export function byProjectListOrder(a: Task, b: Task): number {
  const s = STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
  return s !== 0 ? s : byDue(a, b);
}

/**
 * Freeze a captured visual order: tasks keep the relative order of
 * `pinnedIds` even as their status changes; tasks not pinned yet (just
 * created) append at the end in workspace order. This is what keeps the
 * project task list from jumping while the status circle is clicked —
 * the list only re-sorts on the next visit.
 */
export function inPinnedOrder(tasks: readonly Task[], pinnedIds: readonly string[]): Task[] {
  const rank = new Map(pinnedIds.map((id, i) => [id, i]));
  const pinned: Task[] = [];
  const fresh: Task[] = [];
  for (const t of tasks) (rank.has(t.id) ? pinned : fresh).push(t);
  pinned.sort((a, b) => (rank.get(a.id) ?? 0) - (rank.get(b.id) ?? 0));
  return [...pinned, ...fresh];
}
