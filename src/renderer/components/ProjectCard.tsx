import {
  isOpen,
  isOverdue,
  nextDueTask,
  projectProgress,
  relativeDueLabel,
} from '@shared/domain/derive';
import type { Project } from '@shared/types';

import { useStore } from '../app/store';

import { CategoryPill, Dot } from './primitives';

/** Portfolio project card (prototype _projectCard). */
export function ProjectCard({ project }: { project: Project }): React.JSX.Element {
  const { workspace, today, openProject } = useStore();
  const tasks = (workspace?.tasks ?? []).filter((t) => t.projectId === project.id);
  const open = tasks.filter(isOpen);
  const total = tasks.filter((t) => t.status !== 'Dropped').length;
  const done = tasks.filter((t) => t.status === 'Done').length;
  const overdue = open.filter((t) => isOverdue(t, today));
  const next = nextDueTask(tasks);
  const pct = Math.round(projectProgress(tasks) * 100);
  const nextLabel = next !== null ? relativeDueLabel(next.dueDate, today) : null;

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
      <div className="progress-track">
        <div className="progress-fill" style={{ width: `${pct}%`, background: project.color }} />
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
    </div>
  );
}
