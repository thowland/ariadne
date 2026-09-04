import { calendarTasks } from '@shared/domain/calendar';
import { fmtLong, isValidIsoDate } from '@shared/domain/dates';
import { isOpen, tasksInScope } from '@shared/domain/derive';
import { rescheduleTasks } from '@shared/domain/mutate';
import type { IsoDate } from '@shared/types';
import { useState } from 'react';

import { useStore } from '../app/store';
import { TaskRow } from '../components/TaskRow';

/**
 * Single-day view opened from truncated calendar cells: every task due that
 * day under the current Work/Home/All scope. Clicking a row opens the task
 * editor, which returns here on close.
 *
 * The day is also the unit a holiday or a sick day is cancelled in, so it
 * carries a bulk reschedule (D41): pick a new date, and every *open* task due
 * this day moves to it. Done tasks are deliberately left where they are —
 * they happened on the day they happened, and moving their due date would
 * rewrite history rather than plan.
 */
export function DayModal({ iso }: { iso: IsoDate }): React.JSX.Element {
  const { workspace, scope, apply, closeModal, showToast } = useStore();
  const [target, setTarget] = useState<IsoDate>(iso);
  const [picking, setPicking] = useState(false);

  const tasks = calendarTasks(
    tasksInScope(workspace?.tasks ?? [], workspace?.projects ?? [], scope),
  ).filter((t) => t.dueDate === iso);
  const movable = tasks.filter(isOpen);

  const reschedule = (): void => {
    if (!isValidIsoDate(target) || target === iso) return;
    const ids = movable.map((t) => t.id);
    const result = apply((ws) => rescheduleTasks(ws, ids, target));
    const n = result?.count ?? 0;
    setPicking(false);
    closeModal();
    showToast(
      n === 0
        ? 'Nothing rescheduled'
        : `Rescheduled ${String(n)} task${n === 1 ? '' : 's'} to ${fmtLong(target)}`,
    );
  };

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
          {movable.length > 0 && !picking && (
            <button
              className="btn ghost"
              onClick={() => {
                setPicking(true);
              }}
            >
              Reschedule all…
            </button>
          )}
          <button className="modal-close" aria-label="Close" onClick={closeModal}>
            ×
          </button>
        </div>
        {picking && movable.length > 0 && (
          <div className="day-reschedule" data-testid="day-reschedule">
            <label className="day-reschedule-label" htmlFor="day-reschedule-date">
              Move {movable.length} open task{movable.length === 1 ? '' : 's'} to
            </label>
            <input
              id="day-reschedule-date"
              className="inp"
              type="date"
              value={target}
              aria-label="New due date"
              onChange={(e) => {
                setTarget(e.target.value);
              }}
            />
            <button
              className="btn primary"
              disabled={!isValidIsoDate(target) || target === iso}
              onClick={reschedule}
            >
              Reschedule
            </button>
            <button
              className="btn ghost"
              onClick={() => {
                setPicking(false);
                setTarget(iso);
              }}
            >
              Cancel
            </button>
          </div>
        )}
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
