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
