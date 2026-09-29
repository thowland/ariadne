import type { ProjectCategory, TaskPriority, TaskStatus } from '@shared/types';

/**
 * The semantic palettes, as CSS custom properties rather than literals (D38).
 *
 * Every one of these is handed straight to a `style` or an SVG `fill`, and
 * `var(--x)` is valid in both — so pointing them at tokens re-themes the
 * whole app without a single call site changing. The values live in
 * `styles/tokens.css`, which is also where the dark set is.
 *
 * The catch: a `var()` only resolves in a document that declares it. The
 * report print stylesheet is a separate document, so it redeclares these —
 * see `REPORT_PRINT_CSS`, and the test that keeps the two lists in step.
 */

/** Status colors (text, background, dot) — design/README.md §Design Tokens. */
export const STATUS_COLORS: Record<TaskStatus, { c: string; bg: string; dot: string }> = {
  Todo: { c: 'var(--status-todo-c)', bg: 'var(--status-todo-bg)', dot: 'var(--status-todo-dot)' },
  Doing: {
    c: 'var(--status-doing-c)',
    bg: 'var(--status-doing-bg)',
    dot: 'var(--status-doing-dot)',
  },
  Waiting: {
    c: 'var(--status-waiting-c)',
    bg: 'var(--status-waiting-bg)',
    dot: 'var(--status-waiting-dot)',
  },
  Done: { c: 'var(--status-done-c)', bg: 'var(--status-done-bg)', dot: 'var(--status-done-dot)' },
  Dropped: {
    c: 'var(--status-dropped-c)',
    bg: 'var(--status-dropped-bg)',
    dot: 'var(--status-dropped-dot)',
  },
};

/** Priority colors (text, dot, background). */
export const PRIORITY_COLORS: Record<TaskPriority, { c: string; dot: string; bg: string }> = {
  Critical: {
    c: 'var(--prio-critical-c)',
    dot: 'var(--prio-critical-dot)',
    bg: 'var(--prio-critical-bg)',
  },
  High: { c: 'var(--prio-high-c)', dot: 'var(--prio-high-dot)', bg: 'var(--prio-high-bg)' },
  Medium: {
    c: 'var(--prio-medium-c)',
    dot: 'var(--prio-medium-dot)',
    bg: 'var(--prio-medium-bg)',
  },
  Low: { c: 'var(--prio-low-c)', dot: 'var(--prio-low-dot)', bg: 'var(--prio-low-bg)' },
};

/** Work/Home category pill colors. */
export const CATEGORY_COLORS: Record<ProjectCategory, { c: string; bg: string }> = {
  work: { c: 'var(--prio-medium-c)', bg: 'var(--prio-medium-bg)' },
  home: { c: 'var(--ok-text)', bg: 'var(--ok-bg)' },
};

/** "Blocked" pill (amber). */
export const BLOCKED_PILL = { c: 'var(--warn-text)', bg: 'var(--warn-bg)' };

/** Report accents that are not a status or a priority. */
export const REPORT_COLORS = {
  done: 'var(--ok-text)',
  planned: 'var(--accent)',
  atRisk: 'var(--danger-text)',
  overdue: 'var(--danger-text)',
  retroBar: 'var(--ok-dot)',
} as const;

/** Initials ink for a pale custom avatar colour (D44); white is the default. */
export const AVATAR_INK_DARK = 'var(--avatar-ink-dark)';
