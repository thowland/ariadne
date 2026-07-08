import { isOpen, isOverdue } from '@shared/domain/derive';

import { useStore } from '../app/store';
import type { ViewName } from '../app/store';
import { Logo } from '../components/Logo';
import { Dot } from '../components/primitives';

const NAV: readonly (readonly [ViewName, string])[] = [
  ['home', 'Command Center'],
  ['calendar', 'Calendar'],
  ['reports', 'Reports'],
  ['settings', 'Settings'],
];

export function Sidebar(): React.JSX.Element {
  const { workspace, today, view, activeProjectId, q, go, openProject, newProject } = useStore();
  const tasks = workspace?.tasks ?? [];
  const searching = q.trim() !== '';
  const overdueTotal = tasks.filter((t) => isOverdue(t, today)).length;

  return (
    <aside className="sidebar scr">
      <div className="sidebar-brand">
        <Logo size={24} />
        <span>Ariadne</span>
      </div>
      <nav className="nav-list" aria-label="Primary">
        {NAV.map(([key, label]) => (
          <button
            key={key}
            className={`navitem ${view === key && !searching ? 'active' : ''}`}
            onClick={() => {
              go(key);
            }}
          >
            <span className="nav-label">{label}</span>
            {key === 'home' && overdueTotal > 0 && (
              <span className="nav-badge">{overdueTotal}</span>
            )}
          </button>
        ))}
      </nav>
      <div className="sidebar-section">
        <span className="label">PROJECTS</span>
        <button className="add-btn" title="New project" onClick={newProject}>
          +
        </button>
      </div>
      <nav className="nav-list" aria-label="Projects">
        {(workspace?.projects ?? []).map((p) => {
          const projectTasks = tasks.filter((t) => t.projectId === p.id);
          const open = projectTasks.filter(isOpen).length;
          const overdue = projectTasks.filter((t) => isOverdue(t, today)).length;
          const active = view === 'project' && activeProjectId === p.id && !searching;
          return (
            <button
              key={p.id}
              className={`navitem ${active ? 'active' : ''}`}
              onClick={() => {
                openProject(p.id);
              }}
            >
              <Dot color={p.color} size={8} />
              <span className="nav-label">{p.name}</span>
              {overdue > 0 ? (
                <span className="nav-count overdue">{overdue}</span>
              ) : open > 0 ? (
                <span className="nav-count">{open}</span>
              ) : null}
            </button>
          );
        })}
      </nav>
    </aside>
  );
}
