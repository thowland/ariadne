import { contactName, projectContacts } from '@shared/domain/contacts';
import type { ProjectContact } from '@shared/domain/contacts';
import { addContactToProject, removeContactFromProject } from '@shared/domain/mutate';
import { useState } from 'react';

import { useStore } from '../app/store';

import { ContactActionLink, ContactAvatar, ContactPicker, CopyValue } from './ContactBits';
import { Card } from './primitives';

/**
 * One person on a project's Contacts card (D31): a compact row that expands
 * to the reachable details. Collapsed it answers "who is involved"; expanded
 * it answers "how do I reach them", which is the whole point of keeping this
 * beside the work rather than in a separate address book.
 */
function ContactAccordionRow({ row }: { row: ProjectContact }): React.JSX.Element {
  const { activeProjectId, apply, openContact, askConfirm, showToast } = useStore();
  const [open, setOpen] = useState(false);
  const c = row.contact;
  const name = contactName(c);
  const subtitle = [c.role, c.company].filter((x) => x.trim() !== '').join(' · ');

  const detach = (): void => {
    if (activeProjectId === null) return;
    const projectId = activeProjectId;
    void askConfirm(`Remove ${name} from this project?`, {
      confirmLabel: 'Remove',
      danger: false,
    }).then((ok) => {
      if (!ok) return;
      apply((ws) => removeContactFromProject(ws, projectId, c.id));
      showToast(`${name} removed from this project`);
    });
  };

  return (
    <div className={`contact-acc ${open ? 'open' : ''}`} data-testid={`project-contact-${c.id}`}>
      <button
        className="contact-acc-head"
        aria-expanded={open}
        aria-label={`${name} — show contact details`}
        onClick={() => {
          setOpen((o) => !o);
        }}
      >
        <span className="contact-acc-twisty" aria-hidden="true">
          {open ? '▾' : '▸'}
        </span>
        <ContactAvatar contact={c} size={24} />
        <span className="contact-acc-body">
          <span className="contact-acc-name">{name}</span>
          {subtitle !== '' && <span className="contact-acc-sub">{subtitle}</span>}
        </span>
        {/* Why they are on this card. A directly attached stakeholder stays
            put when their project's tasks move; a task-sourced one does not. */}
        <span className="contact-acc-source">
          {row.source === 'direct'
            ? 'project'
            : `${String(row.totalTasks)} task${row.totalTasks === 1 ? '' : 's'}`}
        </span>
      </button>
      {open && (
        <div className="contact-acc-detail">
          {/* Copy the value, or hand it to the OS — the two things you ever
              want from an address sitting next to the work. */}
          <div className="contact-acc-reach">
            <CopyValue value={c.email} what="email" className="contact-field" />
            <ContactActionLink kind="email" value={c.email} who={name} />
          </div>
          <div className="contact-acc-reach">
            <CopyValue value={c.phone} what="phone number" className="contact-field" />
            <ContactActionLink kind="phone" value={c.phone} who={name} />
          </div>
          {c.email.trim() === '' && c.phone.trim() === '' && (
            <div className="card-empty">No email or phone recorded yet.</div>
          )}
          {c.notes.trim() !== '' && <div className="contact-acc-notes">{c.notes}</div>}
          <div className="contact-acc-actions">
            {row.source === 'task' && row.openTasks > 0 && (
              <span className="card-hint">
                {row.openTasks} open task{row.openTasks === 1 ? '' : 's'} here
              </span>
            )}
            <div className="spacer" />
            <button
              className="lib-btn"
              onClick={() => {
                openContact(c.id);
              }}
            >
              Open contact
            </button>
            {row.source === 'direct' && (
              <button className="lib-btn" onClick={detach}>
                Remove
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * The project's people (D31). Shows the contacts attached to the project
 * itself *and* everyone linked to one of its tasks, so adding someone to a
 * task puts them here without a second bookkeeping step. Adding from here
 * attaches them to the project directly, which is what a stakeholder with no
 * task of their own needs.
 */
export function ContactsCard({ projectId }: { projectId: string }): React.JSX.Element {
  const { workspace, apply, showToast } = useStore();
  const rows = workspace === null ? [] : projectContacts(workspace, projectId);

  return (
    <Card
      title="Contacts"
      count={rows.length}
      headRight={
        <ContactPicker
          exclude={rows.map((r) => r.contact.id)}
          trigger="+ Add person"
          placeholder="Search or add a person…"
          ariaLabel="Add a contact to this project"
          onPick={(contactId) => {
            const result = apply((ws) => addContactToProject(ws, projectId, contactId));
            const added = result?.workspace.contacts.find((c) => c.id === contactId);
            if (added !== undefined) showToast(`${contactName(added)} added to this project`);
          }}
        />
      }
    >
      <div className="focus-section-body contact-acc-list" data-testid="project-contacts">
        {rows.length > 0 ? (
          rows.map((row) => <ContactAccordionRow key={row.contact.id} row={row} />)
        ) : (
          <div className="card-empty">
            Nobody linked yet. Add a person here, or type <code>@</code> in a task title to link
            them to the work itself.
          </div>
        )}
      </div>
    </Card>
  );
}
