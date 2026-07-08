import type { ProjectCategory, TaskPriority, TaskStatus } from '@shared/types';

/** Status colors (text, background, dot) — design/README.md §Design Tokens. */
export const STATUS_COLORS: Record<TaskStatus, { c: string; bg: string; dot: string }> = {
  Todo: { c: '#7d7d75', bg: '#efefec', dot: '#b4b4ac' },
  Doing: { c: '#2f62d8', bg: '#e9f0fd', dot: '#2f62d8' },
  Waiting: { c: '#a8710f', bg: '#faf0dc', dot: '#d69220' },
  Done: { c: '#2f8552', bg: '#e7f3ec', dot: '#3a9a5f' },
  Dropped: { c: '#9a9a92', bg: '#f0f0ee', dot: '#bdbdb5' },
};

/** Priority colors (text, dot, background). */
export const PRIORITY_COLORS: Record<TaskPriority, { c: string; dot: string; bg: string }> = {
  Critical: { c: '#c23b2b', dot: '#d94c3a', bg: '#fbeae7' },
  High: { c: '#a8710f', dot: '#e0a020', bg: '#faf0dc' },
  Medium: { c: '#4f5bd5', dot: '#6b76e0', bg: '#eef0fc' },
  Low: { c: '#8a8a82', dot: '#c2c2ba', bg: '#f1f1ef' },
};

/** Work/Home category pill colors. */
export const CATEGORY_COLORS: Record<ProjectCategory, { c: string; bg: string }> = {
  work: { c: '#4f5bd5', bg: '#eef0fc' },
  home: { c: '#2f8552', bg: '#e7f3ec' },
};

/** "Blocked" pill (amber). */
export const BLOCKED_PILL = { c: '#a8710f', bg: '#faf0dc' };
