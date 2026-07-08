import { isBlocked, relativeDueLabel } from '@shared/domain/derive';
import { cycleTaskStatus } from '@shared/domain/mutate';
import type { Task } from '@shared/types';

import { useStore } from '../app/store';
import { BLOCKED_PILL, PRIORITY_COLORS, STATUS_COLORS } from '../styles/colors';

import { Dot, Pill } from './primitives';

/**
 * The universal task row (prototype _taskRow): status-cycle circle, title,
 * optional project line, blocked pill, priority dot, relative due label.
 */
export function TaskRow({
  task,
  showProject = false,
}: {
  task: Task;
  showProject?: boolean;
}): React.JSX.Element {
  const { workspace, today, apply, openTask } = useStore();
  const st = STATUS_COLORS[task.status];
  const done = task.status === 'Done' || task.status === 'Dropped';
  const rel = relativeDueLabel(task.dueDate, today);
  const project = workspace?.projects.find((p) => p.id === task.projectId);
  const byId = new Map((workspace?.tasks ?? []).map((t) => [t.id, t]));
  const blocked = isBlocked(task, byId);
  const showPrio = (task.priority === 'Critical' || task.priority === 'High') && !blocked;

  return (
    <div
      className="trow"
      onClick={() => {
        openTask(task.id);
      }}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter') openTask(task.id);
      }}
    >
      <button
        className="status-toggle"
        title={`Advance status (${task.status})`}
        style={{ borderColor: st.dot, background: done ? st.dot : 'transparent' }}
        onClick={(e) => {
          e.stopPropagation();
          apply((ws, ctx) => cycleTaskStatus(ws, task.id, ctx));
        }}
      >
        {task.status === 'Doing' && <span className="doing-core" style={{ background: st.dot }} />}
      </button>
      <div className="trow-body">
        <div className={`trow-title ${task.status === 'Done' ? 'done' : done ? 'closed' : ''}`}>
          {task.title || 'Untitled task'}
        </div>
        {showProject && project !== undefined && (
          <div className="trow-project">
            <Dot color={project.color} size={7} />
            {project.name}
          </div>
        )}
      </div>
      {blocked && <Pill text="blocked" c={BLOCKED_PILL.c} bg={BLOCKED_PILL.bg} />}
      {showPrio && (
        <span title={`${task.priority} priority`}>
          <Dot color={PRIORITY_COLORS[task.priority].dot} size={8} />
        </span>
      )}
      {rel.text !== '' && (
        <span className="trow-due" style={{ color: rel.color }}>
          {rel.text}
        </span>
      )}
    </div>
  );
}
