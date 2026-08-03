import { isArchived, isOpen, isOverdue } from '@shared/domain/derive';
import {
  createTask,
  deleteProject,
  moveProject,
  rescheduleTasks,
  updateProject,
} from '@shared/domain/mutate';
import type { Project } from '@shared/types';
import { useState } from 'react';

import { getApi } from '../app/api';
import { useStore } from '../app/store';
import type { ContextMenuItem, ViewName } from '../app/store';
import { menuHandler } from '../components/ContextMenu';
import { Logo } from '../components/Logo';
import { Dot } from '../components/primitives';

const NAV: readonly (readonly [ViewName, string])[] = [
  ['home', 'Command Center'],
  ['calendar', 'Calendar'],
  ['reports', 'Reports'],
  ['files', 'Files'],
  ['tags', 'Tags'],
  ['settings', 'Settings'],
];

export function Sidebar(): React.JSX.Element {
  const {
    workspace,
    today,
    view,
    activeProjectId,
    q,
    go,
    openProject,
    openTask,
    newProject,
    openMoveTasks,
    openContextMenu,
    askConfirm,
    apply,
    showToast,
  } = useStore();
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [archiveOver, setArchiveOver] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const tasks = workspace?.tasks ?? [];
  const searching = q.trim() !== '';
  const projects = workspace?.projects ?? [];
  const activeProjects = projects.filter((p) => !isArchived(p));
  const archivedProjects = projects.filter(isArchived);
  const activeIds = new Set(activeProjects.map((p) => p.id));
  const overdueTotal = tasks.filter(
    (t) => activeIds.has(t.projectId) && isOverdue(t, today),
  ).length;

  /**
   * Right-click actions for a project (D21). Everything here is also reachable
   * the long way — the project screen's own controls — so the menu stays an
   * accelerator rather than the only route.
   */
  const projectMenu = (p: Project): ContextMenuItem[] => {
    const archived = isArchived(p);
    const own = tasks.filter((t) => t.projectId === p.id);
    const openCount = own.filter(isOpen).length;
    const overdueCount = own.filter((t) => isOverdue(t, today)).length;
    return [
      {
        label: 'Open project',
        onSelect: () => {
          openProject(p.id);
        },
      },
      {
        label: archived ? 'Restore from archive' : 'Archive project',
        onSelect: () => {
          apply((ws) => updateProject(ws, p.id, { archived: !archived }));
          showToast(archived ? `${p.name} restored` : `${p.name} archived`);
        },
      },
      {
        label: `Move ${String(own.length)} task${own.length === 1 ? '' : 's'} to project…`,
        disabled: own.length === 0,
        separatorBefore: true,
        onSelect: () => {
          openMoveTasks({
            taskIds: own.map((t) => t.id),
            fromProjectId: p.id,
            what: `${String(own.length)} task${own.length === 1 ? '' : 's'} in ${p.name}`,
          });
        },
      },
      {
        label: `Reschedule ${String(overdueCount)} overdue for today`,
        disabled: overdueCount === 0,
        onSelect: () => {
          const ids = own.filter((t) => isOverdue(t, today)).map((t) => t.id);
          const result = apply((ws) => rescheduleTasks(ws, ids, today));
          const n = result?.count ?? 0;
          showToast(`Rescheduled ${String(n)} task${n === 1 ? '' : 's'} for today`);
        },
      },
      {
        label: 'New task in this project',
        separatorBefore: true,
        onSelect: () => {
          const result = apply((ws, ctx) => createTask(ws, ctx, p.id, {}));
          if (result !== null) openTask(result.id);
        },
      },
      {
        label: 'Delete project…',
        danger: true,
        separatorBefore: true,
        onSelect: () => {
          void askConfirm(
            openCount > 0
              ? `Delete ${p.name}? Its ${String(own.length)} task${own.length === 1 ? '' : 's'} and files go too.`
              : `Delete ${p.name} and all its tasks?`,
          ).then((ok) => {
            if (!ok) return;
            const result = apply((ws) => deleteProject(ws, p.id));
            if (result !== null && result.removedBlobIds.length > 0) {
              void getApi().deleteBlobs(result.removedBlobIds);
            }
            if (activeProjectId === p.id) go('home');
            showToast(`${p.name} deleted`);
          });
        },
      },
    ];
  };

  const archiveDragged = (): void => {
    if (dragId !== null) {
      const name = projects.find((p) => p.id === dragId)?.name ?? 'Project';
      apply((ws) => updateProject(ws, dragId, { archived: true }));
      showToast(`${name} archived`);
    }
    setDragId(null);
    setDragOverId(null);
    setArchiveOver(false);
  };

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
        {activeProjects.map((p) => {
          const projectTasks = tasks.filter((t) => t.projectId === p.id);
          const open = projectTasks.filter(isOpen).length;
          const overdue = projectTasks.filter((t) => isOverdue(t, today)).length;
          const active = view === 'project' && activeProjectId === p.id && !searching;
          return (
            <button
              key={p.id}
              className={`navitem ${active ? 'active' : ''} ${dragOverId === p.id && dragId !== p.id ? 'drag-over' : ''}`}
              draggable
              aria-label={`${p.name} (drag to reorder)`}
              onDragStart={(e) => {
                setDragId(p.id);
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', p.id);
              }}
              onDragOver={(e) => {
                if (dragId !== null) {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = 'move';
                  setDragOverId(p.id);
                }
              }}
              onDragLeave={() => {
                setDragOverId((current) => (current === p.id ? null : current));
              }}
              onDrop={(e) => {
                e.preventDefault();
                if (dragId !== null && dragId !== p.id) {
                  // The visible list is filtered, so resolve the target's
                  // index in the full projects array inside the mutation.
                  apply((ws) =>
                    moveProject(
                      ws,
                      dragId,
                      ws.projects.findIndex((x) => x.id === p.id),
                    ),
                  );
                }
                setDragId(null);
                setDragOverId(null);
              }}
              onDragEnd={() => {
                setDragId(null);
                setDragOverId(null);
                setArchiveOver(false);
              }}
              onClick={() => {
                openProject(p.id);
              }}
              onContextMenu={menuHandler(openContextMenu, p.name, () => projectMenu(p))}
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
      {(archivedProjects.length > 0 || dragId !== null) && (
        <>
          <div
            className={`sidebar-section archive-section ${archiveOver && dragId !== null ? 'drag-over' : ''}`}
            data-testid="archive-drop"
            onDragOver={(e) => {
              if (dragId !== null) {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                setArchiveOver(true);
              }
            }}
            onDragLeave={() => {
              setArchiveOver(false);
            }}
            onDrop={(e) => {
              e.preventDefault();
              archiveDragged();
            }}
          >
            <button
              className="label archive-toggle"
              onClick={() => {
                setShowArchived((s) => !s);
              }}
            >
              {dragId !== null
                ? 'DROP TO ARCHIVE'
                : `ARCHIVED (${archivedProjects.length}) ${showArchived ? '▾' : '▸'}`}
            </button>
          </div>
          {showArchived && dragId === null && (
            <nav className="nav-list" aria-label="Archived projects">
              {archivedProjects.map((p) => {
                const active = view === 'project' && activeProjectId === p.id && !searching;
                return (
                  <button
                    key={p.id}
                    className={`navitem archived ${active ? 'active' : ''}`}
                    onClick={() => {
                      openProject(p.id);
                    }}
                    onContextMenu={menuHandler(openContextMenu, p.name, () => projectMenu(p))}
                  >
                    <Dot color={p.color} size={8} />
                    <span className="nav-label">{p.name}</span>
                  </button>
                );
              })}
            </nav>
          )}
        </>
      )}
    </aside>
  );
}
