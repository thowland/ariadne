import { fmtLong } from '@shared/domain/dates';
import { isOverdue, tasksInScope } from '@shared/domain/derive';

import { useStore } from '../app/store';
import type { ViewName } from '../app/store';

const VIEW_TITLES: Record<ViewName, string> = {
  home: 'Command Center',
  calendar: 'Calendar',
  reports: 'Reports',
  contacts: 'Contacts',
  contact: 'Contact',
  files: 'Files',
  tags: 'Tags',
  settings: 'Settings',
  project: 'Project',
  projects: 'All projects',
};

export function TopBar(): React.JSX.Element {
  const {
    workspace,
    today,
    view,
    activeProjectId,
    q,
    setQuery,
    setScope,
    go,
    newTaskGlobal,
    newProject,
    openAiImport,
  } = useStore();
  const searching = q.trim() !== '';
  // Scope 'all' still excludes archived projects' tasks.
  const overdue = tasksInScope(workspace?.tasks ?? [], workspace?.projects ?? [], 'all').filter(
    (t) => isOverdue(t, today),
  ).length;

  const title = searching
    ? 'Search results'
    : view === 'project'
      ? (workspace?.projects.find((p) => p.id === activeProjectId)?.name ?? 'Project')
      : VIEW_TITLES[view];

  return (
    <header className="topbar">
      <div className="topbar-title">
        <div className="view-name">{title}</div>
        <div className="view-date">{fmtLong(today)}</div>
      </div>
      {overdue > 0 && (
        <button
          className="overdue-pill"
          onClick={() => {
            setScope('all');
            go('home');
          }}
        >
          <span className="dot" style={{ width: 6, height: 6, background: '#d94c3a' }} />
          {overdue} overdue
        </button>
      )}
      <div className="spacer" />
      <input
        className="inp search-input"
        placeholder="Search tasks & projects…"
        value={q}
        onChange={(e) => {
          setQuery(e.target.value);
        }}
      />
      <button className="btn ghost" title="Extract tasks from pasted text" onClick={openAiImport}>
        AI import…
      </button>
      <button className="btn ghost" onClick={newProject}>
        + New project
      </button>
      <button className="btn primary" onClick={newTaskGlobal}>
        + New task
      </button>
    </header>
  );
}
