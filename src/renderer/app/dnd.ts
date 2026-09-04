/**
 * Drag-and-drop payload types.
 *
 * Tasks and projects are both dragged onto the sidebar, so they need to be
 * distinguishable. A custom MIME type does that without any shared state:
 * `dataTransfer.getData` is deliberately blanked during `dragover` for
 * security, but `dataTransfer.types` is readable throughout the drag, so a
 * drop target can tell what is coming before it commits to accepting it.
 */
export const TASK_DND_TYPE = 'application/x-ariadne-task';

/** True while a task (rather than a project) is being dragged. */
export function isTaskDrag(dt: DataTransfer | null): boolean {
  return dt?.types.includes(TASK_DND_TYPE) === true;
}

/**
 * A sidebar group divider (D42) — dragged off the palette at the foot of the
 * sidebar, or picked up from the project list to be moved or thrown away.
 */
export const DIVIDER_DND_TYPE = 'application/x-ariadne-divider';

/** True while a divider (rather than a task or a project) is being dragged. */
export function isDividerDrag(dt: DataTransfer | null): boolean {
  return dt?.types.includes(DIVIDER_DND_TYPE) === true;
}
