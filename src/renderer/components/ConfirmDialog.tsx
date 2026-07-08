import { useStore } from '../app/store';

/**
 * In-app replacement for window.confirm (spec: destructive actions use an
 * in-app dialog). Rendered by App whenever a confirm is pending.
 */
export function ConfirmDialog(): React.JSX.Element | null {
  const { confirmState, resolveConfirm } = useStore();
  if (confirmState === null) return null;

  return (
    <div
      className="overlay confirm-overlay"
      onClick={() => {
        resolveConfirm(false);
      }}
    >
      <div
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
            autoFocus
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
