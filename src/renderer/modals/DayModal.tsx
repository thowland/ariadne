import { calendarTasks } from '@shared/domain/calendar';
import { fmtLong } from '@shared/domain/dates';
import { tasksInScope } from '@shared/domain/derive';
import type { IsoDate } from '@shared/types';

import { useStore } from '../app/store';
import { TaskRow } from '../components/TaskRow';

/**
 * Single-day view opened from truncated calendar cells: every task due that
 * day under the current Work/Home/All scope. Clicking a row opens the task
 * editor, which returns here on close.
 */
export function DayModal({ iso }: { iso: IsoDate }): React.JSX.Element {
  const { workspace, scope, closeModal } = useStore();
  const tasks = calendarTasks(
    tasksInScope(workspace?.tasks ?? [], workspace?.projects ?? [], scope),
  ).filter((t) => t.dueDate === iso);

  return (
    <div className="overlay" onClick={closeModal} data-testid="day-modal-overlay">
      <div
        className="modal-panel day-modal scr"
        role="dialog"
        aria-label={`Tasks due ${fmtLong(iso)}`}
        onClick={(e) => {
          e.stopPropagation();
        }}
      >
        <div className="modal-header day-header">
          <div>
            <div className="day-title">{fmtLong(iso)}</div>
            <div className="day-count">
              {tasks.length} task{tasks.length !== 1 ? 's' : ''} due
            </div>
          </div>
          <div className="spacer" />
          <button className="modal-close" aria-label="Close" onClick={closeModal}>
            ×
          </button>
        </div>
        <div className="focus-section-body day-body">
          {tasks.length > 0 ? (
            tasks.map((t) => <TaskRow key={t.id} task={t} showProject />)
          ) : (
            <div className="card-empty">Nothing due this day in the current scope.</div>
          )}
        </div>
      </div>
    </div>
  );
}
