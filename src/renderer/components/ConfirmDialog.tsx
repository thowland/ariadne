import { useEffect, useRef } from 'react';

import { useStore } from '../app/store';

/**
 * In-app replacement for window.confirm (spec: destructive actions use an
 * in-app dialog). Rendered by App whenever a confirm is pending.
 *
 * Focus moves to the dialog itself, never to the destructive button — the
 * Enter keystroke that triggered the confirm (e.g. committing a rename)
 * must not be able to accept it in the same breath.
 */
export function ConfirmDialog(): React.JSX.Element | null {
  const { confirmState, resolveConfirm } = useStore();
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (confirmState !== null) panelRef.current?.focus();
  }, [confirmState]);

  if (confirmState === null) return null;

  return (
    <div
      className="overlay confirm-overlay"
      onClick={() => {
        resolveConfirm(false);
      }}
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        className="confirm-panel"
        role="alertdialog"
        aria-label="Confirm"
        onClick={(e) => {
          e.stopPropagation();
        }}
      >
        <p className="confirm-message">{confirmState.message}</p>
        <div className="confirm-actions">
          <button
            className="btn ghost"
            onClick={() => {
              resolveConfirm(false);
            }}
          >
            Cancel
          </button>
          <button
            className="btn danger"
            onClick={() => {
              resolveConfirm(true);
            }}
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}
