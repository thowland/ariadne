import { isoAdd } from '@shared/domain/dates';
import { isBlocked, taskDueLabel } from '@shared/domain/derive';
import { cycleTaskStatus, deleteTask, rescheduleTasks, updateTask } from '@shared/domain/mutate';
import type { Task } from '@shared/types';

import { useStore } from '../app/store';
import type { ContextMenuItem } from '../app/store';
import { BLOCKED_PILL, PRIORITY_COLORS, STATUS_COLORS } from '../styles/colors';

import { menuHandler } from './ContextMenu';
import { Dot, Pill } from './primitives';

/**
 * The universal task row (prototype _taskRow): status-cycle circle, title,
 * optional project line, blocked pill, priority dot, relative due label.
 *
 * Right-click opens the task accelerator menu (D21). Every item there is also
 * reachable by opening the task editor the ordinary way.
 */
export function TaskRow({
  task,
  showProject = false,
}: {
  task: Task;
  showProject?: boolean;
}): React.JSX.Element {
  const {
    workspace,
    today,
    apply,
    openTask,
    openProject,
    openMoveTasks,
    openContextMenu,
    askConfirm,
    showToast,
  } = useStore();
  const st = STATUS_COLORS[task.status];
  const done = task.status === 'Done' || task.status === 'Dropped';
  const rel = taskDueLabel(task, today);
  const project = workspace?.projects.find((p) => p.id === task.projectId);
  const byId = new Map((workspace?.tasks ?? []).map((t) => [t.id, t]));
  const blocked = isBlocked(task, byId);
  const showPrio = (task.priority === 'Critical' || task.priority === 'High') && !blocked;

  const reschedule = (due: string | null, said: string): void => {
    apply((ws) => rescheduleTasks(ws, [task.id], due));
    showToast(said);
  };

  const menu = (): ContextMenuItem[] => [
    {
      label: 'Open task…',
      onSelect: () => {
        openTask(task.id);
      },
    },
    {
      label: 'Due today',
      separatorBefore: true,
      disabled: task.dueDate === today,
      onSelect: () => {
        reschedule(today, 'Due today');
      },
    },
    {
      label: 'Due tomorrow',
      disabled: task.dueDate === isoAdd(today, 1),
      onSelect: () => {
        reschedule(isoAdd(today, 1), 'Due tomorrow');
      },
    },
    {
      label: 'Due next week',
      onSelect: () => {
        reschedule(isoAdd(today, 7), 'Due next week');
      },
    },
    {
      label: 'Clear due date',
      disabled: task.dueDate === null,
      onSelect: () => {
        reschedule(null, 'Due date cleared');
      },
    },
    {
      label: task.status === 'Done' ? 'Reopen (back to Todo)' : 'Mark complete',
      separatorBefore: true,
      onSelect: () => {
        const next = task.status === 'Done' ? 'Todo' : 'Done';
        apply((ws, ctx) => updateTask(ws, task.id, { status: next }, ctx));
        showToast(next === 'Done' ? 'Marked complete' : 'Task reopened');
      },
    },
    {
      label: 'Drop task',
      disabled: task.status === 'Dropped',
      onSelect: () => {
        apply((ws, ctx) => updateTask(ws, task.id, { status: 'Dropped' }, ctx));
        showToast('Task dropped');
      },
    },
    {
      label: 'Move to project…',
      separatorBefore: true,
      onSelect: () => {
        openMoveTasks({
          taskIds: [task.id],
          fromProjectId: task.projectId,
          what: task.title || 'Untitled task',
        });
      },
    },
    ...(showProject && project !== undefined
      ? [
          {
            label: `Go to ${project.name}`,
            onSelect: () => {
              openProject(project.id);
            },
          },
        ]
      : []),
    {
      label: 'Delete task…',
      danger: true,
      separatorBefore: true,
      onSelect: () => {
        void askConfirm(`Delete “${task.title || 'Untitled task'}”?`).then((ok) => {
          if (!ok) return;
          apply((ws) => deleteTask(ws, task.id));
          showToast('Task deleted');
        });
      },
    },
  ];

  return (
    <div
      className="trow"
      onClick={() => {
        openTask(task.id);
      }}
      onContextMenu={menuHandler(openContextMenu, task.title || 'Untitled task', menu)}
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
