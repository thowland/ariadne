import { CONTACT_CSV_COLUMNS, describeImportPlan } from '@shared/domain/contact-csv';
import type { ContactImportPlan } from '@shared/domain/contact-csv';
import { applyContactImport } from '@shared/domain/mutate';

import { useStore } from '../app/store';

/** At most this many names listed before the tail is summarized. */
const PREVIEW_ROWS = 8;

function NameList({ names, label }: { names: string[]; label: string }): React.JSX.Element | null {
  if (names.length === 0) return null;
  const shown = names.slice(0, PREVIEW_ROWS);
  const rest = names.length - shown.length;
  return (
    <div className="import-group">
      <div className="weekly-col-label">{label}</div>
      <div className="import-names">
        {shown.map((n, i) => (
          <span key={`${n}-${String(i)}`} className="import-name">
            {n}
          </span>
        ))}
        {rest > 0 && <span className="import-name muted">…and {rest} more</span>}
      </div>
    </div>
  );
}

/**
 * The review step of a CSV contact import (D33). The plan is already computed
 * — pure, from `planContactImport` — so this dialog only has to show what
 * would happen and let it be called off. Nothing is written until Import is
 * pressed, which is the whole point: an address book is not something you
 * want to discover you have overwritten.
 */
export function ContactImportModal({
  fileName,
  plan,
}: {
  fileName: string;
  plan: ContactImportPlan;
}): React.JSX.Element {
  const { apply, closeModal, showToast } = useStore();
  const total = plan.creates.length + plan.updates.length;

  const run = (): void => {
    const result = apply((ws, ctx) => applyContactImport(ws, ctx, plan));
    closeModal();
    if (result === null) return;
    const parts = [`${String(result.created)} added`, `${String(result.updated)} updated`];
    if (result.linked > 0) parts.push(`${String(result.linked)} manager link(s)`);
    showToast(`Imported contacts — ${parts.join(', ')}`);
  };

  return (
    <div className="overlay" onClick={closeModal} data-testid="contact-import-overlay">
      <div
        className="modal-panel scr"
        role="dialog"
        aria-label="Import contacts"
        onClick={(e) => {
          e.stopPropagation();
        }}
      >
        <div className="modal-header">
          <h2 className="modal-title">Import contacts</h2>
          <button className="modal-close" aria-label="Close" onClick={closeModal}>
            ×
          </button>
        </div>

        <div className="modal-body">
          <div className="import-summary" data-testid="import-summary">
            <span className="import-file">{fileName}</span>
            <span className="muted">
              {plan.rowsRead} row{plan.rowsRead === 1 ? '' : 's'} read · {describeImportPlan(plan)}
            </span>
          </div>

          <NameList label="NEW CONTACTS" names={plan.creates.map((r) => r.name)} />
          <NameList
            label="UPDATES TO PEOPLE YOU ALREADY HAVE"
            names={plan.updates.map((u) =>
              u.existing.company.trim() === ''
                ? u.row.name
                : `${u.row.name} (${u.existing.company})`,
            )}
          />

          {plan.skipped.length > 0 && (
            <div className="import-group">
              <div className="weekly-col-label">SKIPPED</div>
              <div className="import-names">
                {plan.skipped.slice(0, PREVIEW_ROWS).map((s) => (
                  <span key={s.line} className="import-name muted">
                    line {s.line} — {s.reason}
                  </span>
                ))}
                {plan.skipped.length > PREVIEW_ROWS && (
                  <span className="import-name muted">
                    …and {plan.skipped.length - PREVIEW_ROWS} more
                  </span>
                )}
              </div>
            </div>
          )}

          {plan.unresolvedManagers.length > 0 && (
            <div className="import-note" data-testid="import-unresolved">
              No contact matches {plan.unresolvedManagers.map((m) => `“${m}”`).join(', ')}, so those
              reporting lines are left unset rather than inventing a person.
            </div>
          )}

          <div className="import-note muted">
            Matching is on first name, last name and company. A blank cell never clears something
            you already have.
          </div>

          <div className="modal-footer">
            <span className="modal-footnote">
              Columns: {CONTACT_CSV_COLUMNS.map(([, label]) => label).join(', ')}
            </span>
            <div className="spacer" />
            <button className="btn ghost" onClick={closeModal}>
              Cancel
            </button>
            <button className="btn primary" onClick={run}>
              Import {total} contact{total === 1 ? '' : 's'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
