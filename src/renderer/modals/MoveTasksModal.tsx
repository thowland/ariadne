import { isArchived } from '@shared/domain/derive';
import { moveTasksToProject } from '@shared/domain/mutate';
import { useState } from 'react';

import { useStore } from '../app/store';
import type { MoveTasksModalState } from '../app/store';
import { Dot } from '../components/primitives';

/**
 * Bulk "move tasks to project…" picker (D21), opened from either context menu
 * with one task or a whole project's worth. Archived projects are not offered
 * as targets — moving live work into a parked project would hide it (D13).
 */
export function MoveTasksModal({ state }: { state: MoveTasksModalState }): React.JSX.Element {
  const { workspace, apply, closeModal, showToast } = useStore();
  const projects = (workspace?.projects ?? []).filter(
    (p) => !isArchived(p) && p.id !== state.fromProjectId,
  );
  const [targetId, setTargetId] = useState<string | null>(null);

  const move = (): void => {
    if (targetId === null) return;
    const target = projects.find((p) => p.id === targetId);
    const result = apply((ws) => moveTasksToProject(ws, state.taskIds, targetId));
    const n = result?.count ?? 0;
    closeModal();
    showToast(
      n === 0
        ? 'Nothing moved'
        : `Moved ${String(n)} task${n === 1 ? '' : 's'} to ${target?.name ?? 'project'}`,
    );
  };

  return (
    <div className="overlay" onClick={closeModal} data-testid="move-tasks-overlay">
      <div
        className="modal-panel move-modal"
        role="dialog"
        aria-label="Move tasks to project"
        onClick={(e) => {
          e.stopPropagation();
        }}
      >
        <div className="modal-header">
          <div>
            <div className="day-title">Move tasks</div>
            <div className="move-what">{state.what}</div>
          </div>
          <div className="spacer" />
          <button className="modal-close" aria-label="Close" onClick={closeModal}>
            ×
          </button>
        </div>

        <div className="move-body scr">
          {projects.length > 0 ? (
            projects.map((p) => (
              <button
                key={p.id}
                className={`move-option${targetId === p.id ? ' selected' : ''}`}
                aria-pressed={targetId === p.id}
                onClick={() => {
                  setTargetId(p.id);
                }}
                onDoubleClick={move}
              >
                <Dot color={p.color} size={8} />
                <span className="move-option-name">{p.name}</span>
                <span className="card-hint">{p.category}</span>
              </button>
            ))
          ) : (
            <div className="card-empty">
              No other active project to move into. Create one first.
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button className="btn ghost" onClick={closeModal}>
            Cancel
          </button>
          <button className="btn primary" disabled={targetId === null} onClick={move}>
            Move {state.taskIds.length} task{state.taskIds.length === 1 ? '' : 's'}
          </button>
        </div>
      </div>
    </div>
  );
}
