import { fmtShort } from '@shared/domain/dates';
import {
  duePressure,
  indexTasks,
  isOpen,
  isOverdue,
  nextDueTask,
  relativeDueLabel,
  statusComposition,
  weeklyCompletionCounts,
} from '@shared/domain/derive';
import type { Project } from '@shared/types';

import { useStore } from '../app/store';

import { CategoryPill, Dot } from './primitives';

/** Status-strip segment colors: Done, Doing, Blocked, Waiting, Todo. Waiting
 * is a lighter step of the blocked amber (related states, ordered by
 * severity); the 2px gaps do the separating. */
const STRIP_SEGMENTS = [
  ['done', 'var(--ok-dot)'],
  ['doing', 'var(--status-doing-c)'],
  ['blocked', 'var(--warn-dot)'],
  ['waiting', 'var(--spark-warn)'],
  ['todo', 'var(--border-strong)'],
] as const;

/** Due-load cell shades: 0, 1, 2, 3+ due — one accent hue, light → dark. */
const DUE_LEVELS = ['var(--sunken)', 'var(--spark-soft)', 'var(--spark-accent)', 'var(--accent)'];

/** Portfolio project card (prototype _projectCard). */
export function ProjectCard({ project }: { project: Project }): React.JSX.Element {
  const { workspace, today, openProject } = useStore();
  const tasks = (workspace?.tasks ?? []).filter((t) => t.projectId === project.id);
  const open = tasks.filter(isOpen);
  const total = tasks.filter((t) => t.status !== 'Dropped').length;
  const done = tasks.filter((t) => t.status === 'Done').length;
  const overdue = open.filter((t) => isOverdue(t, today));
  const next = nextDueTask(tasks);
  const nextLabel = next !== null ? relativeDueLabel(next.dueDate, today) : null;

  const comp = statusComposition(tasks, indexTasks(tasks));
  const stripTitle = `${comp.done} done · ${comp.doing} doing · ${comp.blocked} blocked · ${comp.waiting} waiting · ${comp.todo} todo`;
  const spark = weeklyCompletionCounts(tasks, today);
  const sparkMax = Math.max(...spark.map((w) => w.count), 1);
  const pressure = duePressure(tasks, today);

  return (
    <div
      className="card clk project-card"
      onClick={() => {
        openProject(project.id);
      }}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter') openProject(project.id);
      }}
      data-testid={`project-card-${project.id}`}
    >
      <div className="pc-head">
        <Dot color={project.color} size={10} />
        <div className="pc-name">{project.name}</div>
        <CategoryPill category={project.category} />
      </div>
      <div className="status-strip" title={stripTitle} data-testid={`strip-${project.id}`}>
        {comp.total > 0 ? (
          STRIP_SEGMENTS.filter(([key]) => comp[key] > 0).map(([key, color]) => (
            <div
              key={key}
              className="status-strip-seg"
              data-seg={key}
              style={{ flexGrow: comp[key], background: color }}
            />
          ))
        ) : (
          <div className="status-strip-seg" style={{ flexGrow: 1, background: 'var(--sunken)' }} />
        )}
      </div>
      <div className="pc-meta">
        <span>{open.length} open</span>
        <span>
          {done}/{total} done
        </span>
        {overdue.length > 0 && <span className="pc-overdue">{overdue.length} overdue</span>}
        <div className="spacer" />
        {nextLabel !== null && (
          <span className="pc-next" style={{ color: nextLabel.color }}>
            {`Next ${nextLabel.text}`}
          </span>
        )}
      </div>
      <div className="pc-viz-row">
        <div
          className="pc-due-strip"
          data-testid={`due-strip-${project.id}`}
          role="img"
          aria-label="Due load this week"
        >
          {pressure.overdue > 0 && (
            <span className="pc-due-overdue" title={`${String(pressure.overdue)} overdue`}>
              {pressure.overdue}
            </span>
          )}
          {pressure.days.map((d) => (
            <span
              key={d.date}
              className={`pc-due-cell ${d.date === today ? 'today' : ''} ${d.date < today ? 'past' : ''}`}
              style={{ background: DUE_LEVELS[Math.min(d.count, 3)] }}
              title={`${fmtShort(d.date)}: ${String(d.count)} due`}
            />
          ))}
        </div>
        <div className="spacer" />
        <div
          className="pc-spark"
          data-testid={`spark-${project.id}`}
          role="img"
          aria-label="Completions per week, last 8 weeks"
        >
          {spark.map((w, i) => (
            <span
              key={w.start}
              className={`pc-spark-slot`}
              title={`Week of ${fmtShort(w.start)}: ${String(w.count)} completed`}
            >
              <span
                className={`pc-spark-bar ${i === spark.length - 1 ? 'current' : ''} ${w.count === 0 ? 'zero' : ''}`}
                style={{ height: `${String((w.count / sparkMax) * 100)}%` }}
              />
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
