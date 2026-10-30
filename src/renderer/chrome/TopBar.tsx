import { fmtLong } from '@shared/domain/dates';
import { isOverdue, tasksInScope } from '@shared/domain/derive';
import { useRef } from 'react';

import { useStore } from '../app/store';
import type { ViewName } from '../app/store';
import { runProjectJsonImport } from '../app/workspace-io';

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
  const xmlInput = useRef<HTMLInputElement>(null);
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
          <span className="dot" style={{ width: 6, height: 6, background: 'var(--danger-dot)' }} />
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
      {/* D54: an MS Project XML export, added as a new project. The same import
          the sidebar's ⤓ runs, with the picker narrowed to XML. */}
      <button
        className="btn ghost"
        title="Import a Microsoft Project XML file as a new project"
        onClick={() => {
          xmlInput.current?.click();
        }}
      >
        XML Import
      </button>
      <input
        ref={xmlInput}
        type="file"
        accept=".xml,application/xml,text/xml"
        aria-label="MS Project XML file"
        data-testid="xml-import-input"
        style={{ display: 'none' }}
        onChange={(e) => {
          const file = e.target.files?.[0];
          // Cleared first so picking the same file again still fires.
          e.target.value = '';
          if (file !== undefined) void runProjectJsonImport(file);
        }}
      />
      <button className="btn ghost" onClick={newProject}>
        + New project
      </button>
      <button className="btn primary" onClick={newTaskGlobal}>
        + New task
      </button>
    </header>
  );
}
