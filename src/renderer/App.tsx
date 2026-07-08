import { todayIso } from '@shared/domain/clock';
import { fmtLong } from '@shared/domain/dates';

/**
 * Sprint 0 placeholder shell. The real global chrome (sidebar, top bar,
 * views) lands in Sprint 2 on top of the Sprint 1 store.
 */
export function App(): React.JSX.Element {
  return (
    <div className="shell">
      <main className="placeholder">
        <span className="brand-mark" aria-hidden="true" />
        <h1>Ariadne</h1>
        <p>{fmtLong(todayIso())}</p>
        <p className="muted">Scaffold online — the Command Center arrives in Sprint 2.</p>
      </main>
    </div>
  );
}
