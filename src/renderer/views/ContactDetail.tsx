import {
  contactName,
  directReports,
  managerCandidates,
  managerOf,
  projectsOfContact,
  tasksOfContact,
} from '@shared/domain/contacts';
import { isOpen } from '@shared/domain/derive';
import { deleteContact, setContactManager, updateContact } from '@shared/domain/mutate';
import { byProjectListOrder } from '@shared/domain/sort';
import type { Contact } from '@shared/types';
import { useState } from 'react';

import { useStore } from '../app/store';
import {
  ContactActionLink,
  ContactAvatar,
  ContactColorPicker,
  ContactPicker,
  CopyValue,
  nextContactColor,
} from '../components/ContactBits';
import { FREE_PLACE_KEY } from '../components/NodeMap';
import { OrgMap } from '../components/OrgMap';
import { Card, Dot } from '../components/primitives';
import { TagEditor } from '../components/TagEditor';
import { TaskRow } from '../components/TaskRow';

/**
 * One labelled text input on the contact form.
 *
 * `placeholder` is shown only while the contact is still blank. On somebody
 * you already know, a greyed-out "Northwind Systems" in an empty Company box
 * reads like a recorded value until you look twice — the hint is worth having
 * when creating a person and only noise afterwards.
 */
function Field({
  label,
  value,
  placeholder,
  guide,
  onChange,
  type = 'text',
}: {
  label: string;
  value: string;
  placeholder?: string;
  /** False on an established contact, which suppresses the placeholder. */
  guide: boolean;
  onChange: (value: string) => void;
  type?: string;
}): React.JSX.Element {
  return (
    <div>
      <div className="field-label">{label.toUpperCase()}</div>
      <input
        className="inp full"
        type={type}
        value={value}
        placeholder={guide ? placeholder : undefined}
        aria-label={label}
        onChange={(e) => {
          onChange(e.target.value);
        }}
      />
    </div>
  );
}

/** True for a contact nobody has filled in yet — the one "New contact" makes. */
function isBlank(contact: Contact): boolean {
  return contact.firstName.trim() === '' && contact.lastName.trim() === '';
}

/**
 * The Details card (D47). Somebody you already know is read far more often
 * than corrected, so their details show as text — the email and phone still
 * one click from the mail client and the dialer — and the form only appears
 * behind Edit, the same arrangement as a project's Links card. A brand-new,
 * blank contact opens straight into the form, since filling it in is the only
 * thing to do with it.
 *
 * Whether the form is open is decided once, when the card mounts (the parent
 * keys it by contact id). Deciding it on every render would snap the form shut
 * the moment the first letter of a new contact's name was typed.
 */
function DetailsCard({
  contact,
  name,
  patch,
}: {
  contact: Contact;
  name: string;
  patch: (fields: Partial<Omit<Contact, 'id'>>) => void;
}): React.JSX.Element {
  const [editing, setEditing] = useState(() => isBlank(contact));
  const setQuery = useStore((s) => s.setQuery);
  // A contact with no name yet is one you are still filling in, so the
  // placeholders stay to show what each box wants.
  const guide = isBlank(contact);
  const facts = (
    [
      ['Company', contact.company],
      ['Department', contact.department],
      ['Role', contact.role],
    ] as const
  ).filter(([, value]) => value.trim() !== '');
  const nothing =
    facts.length === 0 &&
    contact.email.trim() === '' &&
    contact.phone.trim() === '' &&
    contact.tags.length === 0;

  return (
    <Card
      title="Details"
      headRight={
        <button
          className="lib-btn"
          onClick={() => {
            setEditing((e) => !e);
          }}
        >
          {editing ? 'Done' : 'Edit'}
        </button>
      }
    >
      {editing ? (
        <div className="card-pad contact-form">
          <div className="field-grid">
            <Field
              label="First name"
              value={contact.firstName}
              placeholder="Dana"
              guide={guide}
              onChange={(firstName) => {
                patch({ firstName });
              }}
            />
            <Field
              label="Last name"
              value={contact.lastName}
              placeholder="Reyes"
              guide={guide}
              onChange={(lastName) => {
                patch({ lastName });
              }}
            />
            <Field
              label="Company"
              value={contact.company}
              placeholder="Northwind Systems"
              guide={guide}
              onChange={(company) => {
                patch({ company });
              }}
            />
            <Field
              label="Department"
              value={contact.department}
              placeholder="Platform Engineering"
              guide={guide}
              onChange={(department) => {
                patch({ department });
              }}
            />
            <Field
              label="Role"
              value={contact.role}
              placeholder="Platform Lead"
              guide={guide}
              onChange={(role) => {
                patch({ role });
              }}
            />
          </div>
          {/* No copy buttons beside these two — the header already carries
              them, and a second pair squeezed the fields to nothing. The
              action icons are narrow enough to sit here, and they do
              something copying cannot: hand the address to the OS. */}
          <div className="contact-form-row">
            <Field
              label="Email"
              type="email"
              value={contact.email}
              placeholder="dana@example.com"
              guide={guide}
              onChange={(email) => {
                patch({ email });
              }}
            />
            <ContactActionLink kind="email" value={contact.email} who={name} />
          </div>
          <div className="contact-form-row">
            <Field
              label="Phone"
              type="tel"
              value={contact.phone}
              placeholder="(555) 010-0000"
              guide={guide}
              onChange={(phone) => {
                patch({ phone });
              }}
            />
            <ContactActionLink kind="phone" value={contact.phone} who={name} />
          </div>
          <div>
            <div className="field-label">COLOUR</div>
            <ContactColorPicker
              contact={contact}
              onChange={(color) => {
                patch({ color });
              }}
            />
          </div>
          <div>
            <div className="field-label">TAGS</div>
            <TagEditor
              tags={contact.tags}
              onChange={(tags) => {
                patch({ tags });
              }}
            />
          </div>
        </div>
      ) : (
        <div className="card-pad contact-facts" data-testid="contact-facts">
          {facts.map(([label, value]) => (
            <div key={label} className="contact-fact">
              <div className="field-label">{label.toUpperCase()}</div>
              <div className="contact-fact-value">{value}</div>
            </div>
          ))}
          {contact.email.trim() !== '' && (
            <div className="contact-fact">
              <div className="field-label">EMAIL</div>
              <div className="contact-fact-row">
                <span className="contact-fact-value">{contact.email}</span>
                <ContactActionLink kind="email" value={contact.email} who={name} />
              </div>
            </div>
          )}
          {contact.phone.trim() !== '' && (
            <div className="contact-fact">
              <div className="field-label">PHONE</div>
              <div className="contact-fact-row">
                <span className="contact-fact-value">{contact.phone}</span>
                <ContactActionLink kind="phone" value={contact.phone} who={name} />
              </div>
            </div>
          )}
          {contact.tags.length > 0 && (
            <div className="contact-fact">
              <div className="field-label">TAGS</div>
              <div className="tag-editor">
                {contact.tags.map((tag) => (
                  <span key={tag} className="tag-chip">
                    {/* The same search a tag chip runs everywhere else. */}
                    <button
                      className="tag-chip-label"
                      title={`Search for #${tag}`}
                      onClick={() => {
                        setQuery(tag);
                      }}
                    >
                      #{tag}
                    </button>
                  </span>
                ))}
              </div>
            </div>
          )}
          {nothing && (
            <div className="card-empty">Nothing recorded yet. Press Edit to add details.</div>
          )}
        </div>
      )}
    </Card>
  );
}

/**
 * A single contact (D31): their details, editable in place like a project's
 * are, plus everything of theirs that is in flight. The two lists are the
 * point — the address book part is easy, and "what did I ask this person for"
 * is the question that actually sends you looking for them.
 */
export function ContactDetail(): React.JSX.Element {
  const { workspace, activeContactId, apply, go, openContact, openProject, askConfirm, showToast } =
    useStore();

  const contact = workspace?.contacts.find((c) => c.id === activeContactId);
  if (contact === undefined || workspace === null) {
    return <div className="stub-view">Contact not found.</div>;
  }

  const name = contactName(contact);
  const tasks = tasksOfContact(workspace, contact.id);
  const projects = projectsOfContact(workspace, contact.id);
  const openCount = tasks.filter(isOpen).length;
  const manager = managerOf(workspace, contact);
  const reports = directReports(workspace, contact.id);
  // Everyone the picker must not offer: themself and their whole subtree, so
  // a reporting loop cannot be built through the UI at all.
  const allowed = new Set(managerCandidates(workspace, contact.id).map((c) => c.id));
  const forbidden = workspace.contacts.filter((c) => !allowed.has(c.id)).map((c) => c.id);

  const orgLayout = contact.orgLayout ?? {};
  const moveOrgNode = (contactId: string, x: number, y: number): void => {
    patch({
      orgLayout: { ...orgLayout, [contactId]: { x: Math.round(x), y: Math.round(y) } },
    });
  };

  const patch = (fields: Partial<Omit<Contact, 'id'>>): void => {
    apply((ws) => updateContact(ws, contact.id, fields));
  };

  const remove = (): void => {
    void askConfirm(
      tasks.length > 0
        ? `Delete ${name}? They come off ${String(tasks.length)} task${
            tasks.length === 1 ? '' : 's'
          }; the tasks themselves stay.`
        : `Delete ${name}?`,
    ).then((ok) => {
      if (!ok) return;
      apply((ws) => deleteContact(ws, contact.id));
      go('contacts');
      showToast(`${name} deleted`);
    });
  };

  return (
    <div className="view-wrap fadein" style={{ maxWidth: 1080 }}>
      <div className="contact-detail-header">
        <button
          className="lib-btn back-link"
          onClick={() => {
            go('contacts');
          }}
        >
          ← All contacts
        </button>
        <div className="spacer" />
        <button className="btn danger" onClick={remove}>
          Delete
        </button>
      </div>

      <div className="contact-hero">
        {/* Click-to-cycle is the shortcut; the swatches under Details are
            the ordinary route, and the only one to "Automatic" or a custom
            colour (D44). */}
        <button
          type="button"
          className="contact-hero-avatar"
          title="Change colour"
          aria-label="Next avatar colour"
          onClick={() => {
            patch({ color: nextContactColor(contact) });
          }}
        >
          <ContactAvatar contact={contact} size={54} />
        </button>
        <div className="contact-hero-body">
          <h1 className="hero-title" data-testid="contact-headline">
            {name}
          </h1>
          <div className="contact-hero-meta">
            {[contact.role, contact.department, contact.company]
              .filter((x) => x.trim() !== '')
              .join(' · ') || 'No role or company recorded'}
            {openCount > 0 && (
              <span className="contact-hero-count">
                {openCount} open task{openCount === 1 ? '' : 's'}
              </span>
            )}
          </div>
        </div>
        <div className="spacer" />
        {/* The copy row is the fast path: name, email and phone without
            scrolling to the form below or selecting any text. */}
        <div className="contact-hero-copy" data-testid="contact-copy-row">
          <CopyValue value={name} what="name" label="Copy name" />
          <CopyValue value={contact.email} what="email" label="Copy email" />
          <CopyValue value={contact.phone} what="phone number" label="Copy phone" />
        </div>
      </div>

      <div className="project-grid">
        <div className="project-main">
          <Card title="Tasks" count={tasks.length}>
            <div className="focus-section-body">
              {projects.length > 0 ? (
                projects.map((project) => {
                  const own = tasks
                    .filter((t) => t.projectId === project.id)
                    .sort(byProjectListOrder);
                  if (own.length === 0) return null;
                  return (
                    <div key={project.id} className="contact-task-group">
                      <button
                        className="report-project-head contact-group-head"
                        onClick={() => {
                          openProject(project.id);
                        }}
                      >
                        <Dot color={project.color} size={10} />
                        <span className="report-project-name">{project.name}</span>
                        <span className="card-count">{own.length}</span>
                      </button>
                      {own.map((t) => (
                        <TaskRow key={t.id} task={t} />
                      ))}
                    </div>
                  );
                })
              ) : (
                <div className="card-empty">
                  Nothing assigned yet. Type <code>@{contact.firstName || name}</code> in a task
                  title to link them to a piece of work.
                </div>
              )}
              {projects.length > 0 && tasks.length === 0 && (
                <div className="card-empty">
                  Attached to {projects.length} project{projects.length === 1 ? '' : 's'}, but not
                  to any task yet.
                </div>
              )}
            </div>
          </Card>

          <Card
            title="Organization map"
            headRight={
              <div className="lib-actions dep-head">
                {Object.keys(orgLayout).length > 0 && (
                  <button
                    className="lib-btn"
                    onClick={() => {
                      patch({ orgLayout: {} });
                    }}
                  >
                    Reset layout
                  </button>
                )}
                <span className="card-hint">
                  drag to arrange · hold {FREE_PLACE_KEY} to place freely · click to open
                </span>
              </div>
            }
          >
            <div className="card-pad">
              <OrgMap
                workspace={workspace}
                contact={contact}
                positions={orgLayout}
                onMove={moveOrgNode}
                height={contact.orgMapHeight}
                onResize={(orgMapHeight) => {
                  patch({ orgMapHeight });
                }}
              />
            </div>
          </Card>

          <Card title="Projects" count={projects.length}>
            <div className="focus-section-body">
              {projects.length > 0 ? (
                projects.map((project) => {
                  const own = tasks.filter((t) => t.projectId === project.id);
                  const direct = (project.contactIds ?? []).includes(contact.id);
                  return (
                    <button
                      key={project.id}
                      className="report-line contact-project-line"
                      onClick={() => {
                        openProject(project.id);
                      }}
                    >
                      <Dot color={project.color} size={8} />
                      <span className="report-line-title">{project.name}</span>
                      <span className="report-line-due muted">
                        {direct ? 'stakeholder' : ''}
                        {direct && own.length > 0 ? ' · ' : ''}
                        {own.length > 0
                          ? `${String(own.length)} task${own.length === 1 ? '' : 's'}`
                          : ''}
                      </span>
                    </button>
                  );
                })
              ) : (
                <div className="card-empty">Not involved in any project yet.</div>
              )}
            </div>
          </Card>
        </div>

        <div className="project-side">
          <DetailsCard key={contact.id} contact={contact} name={name} patch={patch} />

          <Card title="Organization">
            <div className="card-pad contact-org" data-testid="contact-org">
              <div>
                <div className="field-label">REPORTS TO</div>
                {manager !== undefined ? (
                  <div className="contact-org-row">
                    <button
                      className="contact-org-person"
                      onClick={() => {
                        openContact(manager.id);
                      }}
                    >
                      <ContactAvatar contact={manager} size={22} />
                      <span className="contact-org-name">{contactName(manager)}</span>
                      <span className="contact-org-meta">{manager.role}</span>
                    </button>
                    <div className="spacer" />
                    <button
                      className="lib-btn"
                      aria-label="Clear manager"
                      onClick={() => {
                        apply((ws) => setContactManager(ws, contact.id, null));
                      }}
                    >
                      Clear
                    </button>
                  </div>
                ) : (
                  <ContactPicker
                    trigger="+ Set manager"
                    placeholder="Who do they report to?"
                    ariaLabel="Set manager"
                    // Themself and everyone beneath them are not options.
                    exclude={forbidden}
                    onPick={(managerId) => {
                      apply((ws) => setContactManager(ws, contact.id, managerId));
                    }}
                  />
                )}
              </div>
              <div>
                <div className="field-label">
                  DIRECT REPORTS{reports.length > 0 ? ` · ${String(reports.length)}` : ''}
                </div>
                {reports.length > 0 ? (
                  <div className="contact-org-list">
                    {reports.map((r) => (
                      <button
                        key={r.id}
                        className="contact-org-person"
                        onClick={() => {
                          openContact(r.id);
                        }}
                      >
                        <ContactAvatar contact={r} size={22} />
                        <span className="contact-org-name">{contactName(r)}</span>
                        <span className="contact-org-meta">
                          {[r.role, r.department].filter((x) => x.trim() !== '').join(' · ')}
                        </span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="card-empty">Nobody reports to them here.</div>
                )}
              </div>
            </div>
          </Card>

          <Card title="Notes">
            <div className="card-pad">
              <textarea
                className="inp notes-area"
                value={contact.notes}
                aria-label="Contact notes"
                placeholder="How you know them, what they care about, how they prefer to be reached…"
                onChange={(e) => {
                  patch({ notes: e.target.value });
                }}
              />
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
