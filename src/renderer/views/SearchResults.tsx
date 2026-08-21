import { contactName } from '@shared/domain/contacts';
import { searchContacts, searchProjects, searchTasks } from '@shared/domain/search';

import { useStore } from '../app/store';
import { ContactAvatar, CopyValue } from '../components/ContactBits';
import { ProjectCard } from '../components/ProjectCard';
import { TaskRow } from '../components/TaskRow';

/** Top-bar search results (prototype viewSearch). */
export function SearchResults(): React.JSX.Element {
  const { workspace, q, openContact } = useStore();
  const projects = searchProjects(workspace?.projects ?? [], q);
  const tasks = searchTasks(workspace?.tasks ?? [], q);
  const contacts = searchContacts(workspace?.contacts ?? [], q);

  return (
    <div
      className="view-wrap fadein"
      style={{ maxWidth: 820, display: 'flex', flexDirection: 'column', gap: 16 }}
    >
      <div className="search-summary" data-testid="search-summary">
        {tasks.length} task{tasks.length !== 1 ? 's' : ''} · {projects.length} project
        {projects.length !== 1 ? 's' : ''} · {contacts.length} contact
        {contacts.length !== 1 ? 's' : ''} matching “{q.trim()}”
      </div>
      {projects.length > 0 && (
        <div>
          <div className="search-section-label">PROJECTS</div>
          <div className="search-projects-grid">
            {projects.map((p) => (
              <ProjectCard key={p.id} project={p} />
            ))}
          </div>
        </div>
      )}
      {contacts.length > 0 && (
        <div>
          <div className="search-section-label">CONTACTS</div>
          <div className="card">
            <div className="focus-section-body">
              {contacts.map((c) => (
                <div key={c.id} className="search-contact-row">
                  <button
                    className="search-contact-open"
                    onClick={() => {
                      openContact(c.id);
                    }}
                  >
                    <ContactAvatar contact={c} size={22} />
                    <span className="search-contact-name">{contactName(c)}</span>
                    <span className="search-contact-meta">
                      {[c.role, c.company].filter((x) => x.trim() !== '').join(' · ')}
                    </span>
                  </button>
                  <div className="spacer" />
                  <CopyValue value={c.email} what="email" label="Email" />
                  <CopyValue value={c.phone} what="phone number" label="Phone" />
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
      {tasks.length > 0 && (
        <div>
          <div className="search-section-label">TASKS</div>
          <div className="card">
            <div className="focus-section-body">
              {tasks.map((t) => (
                <TaskRow key={t.id} task={t} showProject />
              ))}
            </div>
          </div>
        </div>
      )}
      {projects.length === 0 && tasks.length === 0 && contacts.length === 0 && (
        <div className="search-empty">No matches.</div>
      )}
    </div>
  );
}
