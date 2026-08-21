import { CONTACT_COLUMNS, contactName, contactRollup, sortContacts } from '@shared/domain/contacts';
import type { ContactSortKey, SortDirection } from '@shared/domain/contacts';
import { fmtShort } from '@shared/domain/dates';
import { useState } from 'react';

import { useStore } from '../app/store';
import { ContactAvatar, CopyValue } from '../components/ContactBits';

/** Columns whose first click should sort high-to-low or newest-first. */
const NUMERIC_COLUMNS = new Set<ContactSortKey>(['open', 'done', 'projects', 'last']);

/**
 * Every person in the workspace (D31), with what they are carrying. The
 * sorting follows the portfolio table's rules — first click on a column sorts
 * it, clicking the active column flips it, counts start high-to-low — because
 * the two screens answer the same shape of question about different nouns.
 */
export function Contacts(): React.JSX.Element {
  const { workspace, today, openContact, newContact, showToast } = useStore();
  const [sort, setSort] = useState<{ key: ContactSortKey; dir: SortDirection }>({
    key: 'name',
    dir: 'asc',
  });
  const [filter, setFilter] = useState('');

  if (workspace === null) return <div className="stub-view">Loading…</div>;

  const needle = filter.trim().toLowerCase();
  const all = contactRollup(workspace, today);
  const matching =
    needle === ''
      ? all
      : all.filter((r) =>
          [contactName(r.contact), r.contact.company, r.contact.role, ...r.contact.tags]
            .join(' ')
            .toLowerCase()
            .includes(needle),
        );
  const rows = sortContacts(matching, sort.key, sort.dir);

  const toggle = (key: ContactSortKey): void => {
    setSort((prev) =>
      prev.key === key
        ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
        : { key, dir: NUMERIC_COLUMNS.has(key) ? 'desc' : 'asc' },
    );
  };

  const add = (): void => {
    const id = newContact();
    if (id === null) return;
    openContact(id);
    showToast('Contact created');
  };

  return (
    <div className="view-wrap fadein" style={{ maxWidth: 1080 }}>
      <div className="home-header">
        <div className="headline">
          <div className="eyebrow">CONTACTS</div>
          <h1 className="hero-title" data-testid="contacts-headline">
            {all.length > 0
              ? `${all.length} contact${all.length > 1 ? 's' : ''}`
              : 'No contacts yet'}
          </h1>
        </div>
        <div className="spacer" />
        <button className="btn ghost" onClick={add}>
          + New contact
        </button>
      </div>

      {all.length > 0 ? (
        <div className="card">
          <div className="card-head">
            <span className="card-title">Everyone</span>
            <span className="card-count">{rows.length}</span>
            <div className="spacer" />
            <input
              className="inp contact-filter-input"
              value={filter}
              placeholder="Filter people…"
              aria-label="Filter contacts"
              onChange={(e) => {
                setFilter(e.target.value);
              }}
            />
          </div>
          <div className="card-pad">
            <table className="portfolio-table contacts-table" data-testid="contacts-table">
              <thead>
                <tr>
                  {CONTACT_COLUMNS.map(([key, label]) => {
                    const active = sort.key === key;
                    return (
                      <th
                        key={key}
                        className={NUMERIC_COLUMNS.has(key) && key !== 'last' ? 'num' : undefined}
                        aria-sort={
                          active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'
                        }
                      >
                        <button
                          className={`sort-header ${active ? 'active' : ''}`}
                          title={`Sort by ${label.toLowerCase()}`}
                          onClick={() => {
                            toggle(key);
                          }}
                        >
                          {label.toUpperCase()}
                          <span className="sort-caret" aria-hidden="true">
                            {active ? (sort.dir === 'asc' ? '▲' : '▼') : ''}
                          </span>
                        </button>
                      </th>
                    );
                  })}
                  <th>REACH</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr
                    key={r.contact.id}
                    className="portfolio-row"
                    data-testid={`contact-row-${r.contact.id}`}
                    onClick={() => {
                      openContact(r.contact.id);
                    }}
                  >
                    <td>
                      <span className="portfolio-name contact-cell-name">
                        <ContactAvatar contact={r.contact} size={22} />
                        {contactName(r.contact)}
                      </span>
                    </td>
                    <td className="muted">{r.contact.company || '—'}</td>
                    <td className="muted">{r.contact.role || '—'}</td>
                    <td className="num">{r.open}</td>
                    <td className="num muted">{r.done}</td>
                    <td className="num">{r.projects}</td>
                    <td className="muted">
                      {r.lastActivity !== null ? fmtShort(r.lastActivity) : '—'}
                    </td>
                    {/* Copying is the reason this screen exists, so the two
                        values you actually need are one click from the list
                        rather than one click plus a page. */}
                    <td>
                      {/* A flex `td` falls out of the table box model and
                          drags its border with it — the buttons get their own
                          box inside an ordinary cell. */}
                      <span className="contact-cell-reach">
                        <CopyValue value={r.contact.email} what="email" label="Email" />
                        <CopyValue value={r.contact.phone} what="phone number" label="Phone" />
                        <CopyValue
                          value={contactName(r.contact)}
                          what="name"
                          label="Name"
                          className="subtle"
                        />
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {rows.length === 0 && (
              <div className="card-empty">No contacts match “{filter.trim()}”.</div>
            )}
          </div>
        </div>
      ) : (
        <div className="card-empty">
          People you add to a project or a task show up here. You can also type <code>@</code> in a
          task title to create one on the spot.
        </div>
      )}
    </div>
  );
}
