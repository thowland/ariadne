import { isArchived, isOpen, isOverdue } from '@shared/domain/derive';
import {
  createTask,
  deleteProject,
  moveProject,
  moveSidebarDivider,
  moveTasksToProject,
  removeSidebarDivider,
  renameSidebarGroup,
  rescheduleTasks,
  toggleSidebarGroup,
  updateProject,
} from '@shared/domain/mutate';
import type { Project } from '@shared/types';
import React, { useRef, useState } from 'react';

import { getApi } from '../app/api';
import { DIVIDER_DND_TYPE, isDividerDrag, isTaskDrag, TASK_DND_TYPE } from '../app/dnd';
import { useStore } from '../app/store';
import type { ContextMenuItem, ViewName } from '../app/store';
import { menuHandler } from '../components/ContextMenu';
import { Logo } from '../components/Logo';
import { Dot } from '../components/primitives';

const NAV: readonly (readonly [ViewName, string])[] = [
  ['home', 'Command Center'],
  ['calendar', 'Calendar'],
  ['reports', 'Reports'],
  ['contacts', 'Contacts'],
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
  // The divider being dragged: its anchor project id, or null while a fresh
  // one is being pulled off the palette.
  const [dividerDrag, setDividerDrag] = useState<{ from: string | null } | null>(null);
  const [dividerOverId, setDividerOverId] = useState<string | null>(null);
  // The group whose name is being typed (D50), with the draft so far.
  const [renaming, setRenaming] = useState<{ anchor: string; value: string } | null>(null);
  /**
   * Whether the divider drag ended on a slot in the project list. A drag that
   * finishes anywhere else — the calendar, the desktop, the middle of the
   * app — is how a divider is thrown away, so `dragend` deletes it unless a
   * drop target claimed it first. Reading `dropEffect` in `dragend` would be
   * the other way to tell, but browsers disagree about its value and jsdom
   * does not set it at all.
   */
  const dividerLanded = useRef(false);
  const tasks = workspace?.tasks ?? [];
  const searching = q.trim() !== '';
  const projects = workspace?.projects ?? [];
  const activeProjects = projects.filter((p) => !isArchived(p));
  const archivedProjects = projects.filter(isArchived);
  const activeIds = new Set(activeProjects.map((p) => p.id));
  const overdueTotal = tasks.filter(
    (t) => activeIds.has(t.projectId) && isOverdue(t, today),
  ).length;

  // A contact's detail page is a leaf of the Contacts screen, so the nav item
  // stays lit while you are on it — the same way a project stays lit.
  const navActive = (key: ViewName): boolean =>
    !searching && (view === key || (key === 'contacts' && view === 'contact'));

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

  const dividers = new Set(workspace?.settings.sidebarDividers ?? []);

  const endDividerDrag = (): void => {
    const from = dividerDrag?.from ?? null;
    if (from !== null && !dividerLanded.current) {
      apply((ws) => removeSidebarDivider(ws, from));
      showToast('Divider removed');
    }
    dividerLanded.current = false;
    setDividerDrag(null);
    setDividerOverId(null);
  };

  /** Accepts a dropped divider above `projectId`. */
  const dropDivider = (projectId: string): void => {
    if (dividerDrag === null) return;
    dividerLanded.current = true;
    const fresh = dividerDrag.from === null;
    const result = apply((ws) => moveSidebarDivider(ws, dividerDrag.from, projectId));
    setDividerDrag(null);
    setDividerOverId(null);
    // A new group is named on the spot; leaving the box blank keeps the
    // generic label, so naming is an offer rather than a step.
    if (fresh && result !== null && result.changed.length > 0) {
      setRenaming({ anchor: projectId, value: '' });
    }
  };

  const groupNames = workspace?.settings.sidebarGroupNames ?? {};
  const collapsedGroups = new Set(workspace?.settings.sidebarCollapsed ?? []);

  // Which group each active project falls in: the nearest divider above it,
  // or none for the projects above the first divider (D50).
  const groupOf = new Map<string, string | null>();
  const groupStats = new Map<string, { count: number; overdue: number }>();
  {
    let anchor: string | null = null;
    for (const p of activeProjects) {
      if (dividers.has(p.id)) anchor = p.id;
      groupOf.set(p.id, anchor);
      if (anchor === null) continue;
      const stats = groupStats.get(anchor) ?? { count: 0, overdue: 0 };
      stats.count += 1;
      stats.overdue += tasks.filter((t) => t.projectId === p.id && isOverdue(t, today)).length;
      groupStats.set(anchor, stats);
    }
  }

  const commitRename = (): void => {
    if (renaming === null) return;
    const { anchor, value } = renaming;
    setRenaming(null);
    apply((ws) => renameSidebarGroup(ws, anchor, value));
  };

  /** Right-click on a group header: shortcuts for what the header itself offers. */
  const groupMenu = (anchor: string): ContextMenuItem[] => [
    {
      label: collapsedGroups.has(anchor) ? 'Expand group' : 'Collapse group',
      onSelect: () => {
        apply((ws) => toggleSidebarGroup(ws, anchor));
      },
    },
    {
      label: 'Rename group…',
      onSelect: () => {
        setRenaming({ anchor, value: groupNames[anchor] ?? '' });
      },
    },
    {
      label: 'Remove divider',
      separatorBefore: true,
      onSelect: () => {
        apply((ws) => removeSidebarDivider(ws, anchor));
        showToast('Divider removed');
      },
    },
  ];

  /**
   * A group header (D50, extending D42's nameless line): a grab handle, the
   * group's name with a twisty that folds the projects under it away — the
   * same arrangement as the ARCHIVED heading — and a pencil to rename it.
   * Dragging the header moves or removes the divider exactly as before.
   */
  const renderDivider = (projectId: string): React.JSX.Element => {
    const name = groupNames[projectId] ?? '';
    const collapsed = collapsedGroups.has(projectId);
    const stats = groupStats.get(projectId) ?? { count: 0, overdue: 0 };
    const editing = renaming?.anchor === projectId;
    return (
      <div
        key={`divider-${projectId}`}
        className={`sidebar-divider sidebar-group${dividerDrag?.from === projectId ? ' dragging' : ''}`}
        data-testid={`sidebar-divider-${projectId}`}
        draggable={!editing}
        role="separator"
        aria-label="Group divider (drag to move, or off the list to remove)"
        onDragStart={(e) => {
          setDividerDrag({ from: projectId });
          dividerLanded.current = false;
          e.dataTransfer.effectAllowed = 'move';
          e.dataTransfer.setData(DIVIDER_DND_TYPE, projectId);
        }}
        onDragEnd={endDividerDrag}
        onContextMenu={menuHandler(openContextMenu, name || 'Group', () => groupMenu(projectId))}
      >
        <span className="sidebar-divider-grip" aria-hidden="true" />
        {editing ? (
          <input
            className="sidebar-group-input"
            value={renaming.value}
            placeholder="Group name"
            aria-label="Group name"
            maxLength={40}
            autoFocus
            onChange={(e) => {
              setRenaming({ anchor: projectId, value: e.target.value });
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitRename();
              if (e.key === 'Escape') setRenaming(null);
            }}
            onBlur={commitRename}
          />
        ) : (
          <button
            className="label sidebar-group-toggle"
            aria-expanded={!collapsed}
            title={collapsed ? 'Show this group' : 'Fold this group away'}
            onClick={() => {
              apply((ws) => toggleSidebarGroup(ws, projectId));
            }}
          >
            <span className="sidebar-group-name">{name || 'Group'}</span> ({stats.count}){' '}
            {collapsed ? '▸' : '▾'}
          </button>
        )}
        {/* Folded away, a group still says when something in it is late. */}
        {collapsed && stats.overdue > 0 && !editing && (
          <span className="nav-count overdue" title="Overdue tasks in this group">
            {stats.overdue}
          </span>
        )}
        <span className="sidebar-divider-rule" aria-hidden="true" />
        {!editing && (
          <button
            className="sidebar-group-rename"
            aria-label={`Rename group ${name || 'Group'}`}
            title="Rename group"
            onClick={() => {
              setRenaming({ anchor: projectId, value: name });
            }}
          >
            ✎
          </button>
        )}
      </div>
    );
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
            className={`navitem ${navActive(key) ? 'active' : ''}`}
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
        <button
          className={`label label-btn ${view === 'projects' && !searching ? 'active' : ''}`}
          title="See every project with its counts and tags"
          onClick={() => {
            go('projects');
          }}
        >
          PROJECTS
        </button>
        <button className="add-btn" title="New project" onClick={newProject}>
          +
        </button>
      </div>
      <nav className="nav-list" aria-label="Projects">
        {activeProjects.map((p) => {
          const group = groupOf.get(p.id) ?? null;
          // A folded group shows only its header, which is the divider itself.
          // Same fragment key either way, so folding keeps the header mounted
          // and the twisty keeps keyboard focus.
          if (group !== null && collapsedGroups.has(group)) {
            return group === p.id ? (
              <React.Fragment key={p.id}>{renderDivider(p.id)}</React.Fragment>
            ) : null;
          }
          const projectTasks = tasks.filter((t) => t.projectId === p.id);
          const open = projectTasks.filter(isOpen).length;
          const overdue = projectTasks.filter((t) => isOverdue(t, today)).length;
          const active = view === 'project' && activeProjectId === p.id && !searching;
          const button = (
            <button
              key={p.id}
              className={`navitem ${active ? 'active' : ''} ${dragOverId === p.id && dragId !== p.id ? 'drag-over' : ''}${dividerOverId === p.id ? ' divider-over' : ''}`}
              draggable
              aria-label={`${p.name} (drag to reorder, or drop a task here to move it)`}
              onDragStart={(e) => {
                setDragId(p.id);
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', p.id);
              }}
              onDragOver={(e) => {
                // Three kinds of payload land here: a project being reordered,
                // a task being reassigned to this project, and a group
                // divider being placed above it.
                if (isDividerDrag(e.dataTransfer)) {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = 'move';
                  setDividerOverId(p.id);
                  return;
                }
                if (dragId !== null || isTaskDrag(e.dataTransfer)) {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = 'move';
                  setDragOverId(p.id);
                }
              }}
              onDragLeave={() => {
                setDragOverId((current) => (current === p.id ? null : current));
                setDividerOverId((current) => (current === p.id ? null : current));
              }}
              onDrop={(e) => {
                e.preventDefault();
                // Gate on the payload type, the same signal dragover used —
                // not on getData returning something, which cannot tell a
                // missing key from a real value.
                if (isDividerDrag(e.dataTransfer)) {
                  dropDivider(p.id);
                  return;
                }
                if (isTaskDrag(e.dataTransfer)) {
                  const taskId = e.dataTransfer.getData(TASK_DND_TYPE);
                  const moved = tasks.find((t) => t.id === taskId);
                  if (moved !== undefined && moved.projectId !== p.id) {
                    // moveTasksToProject scrubs the dependency links that
                    // cannot survive the move and drags attached files along.
                    apply((ws) => moveTasksToProject(ws, [taskId], p.id));
                    showToast(`“${moved.title || 'Untitled task'}” moved to ${p.name}`);
                  }
                } else if (dragId !== null && dragId !== p.id) {
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
          // A divider is stored as "the group starts at this project", so it
          // renders immediately above the project it is anchored to.
          if (!dividers.has(p.id)) return button;
          return (
            <React.Fragment key={p.id}>
              {renderDivider(p.id)}
              {button}
            </React.Fragment>
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
      <div className="sidebar-divider-palette">
        <button
          className="divider-source"
          data-testid="divider-source"
          draggable
          title="Drag onto a project to start a new group"
          aria-label="New group divider — drag onto a project to start a group there"
          onDragStart={(e) => {
            setDividerDrag({ from: null });
            dividerLanded.current = false;
            // 'move', not 'copy': the drop targets set dropEffect = 'move',
            // and a browser refuses a drop whose effects disagree.
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData(DIVIDER_DND_TYPE, 'new');
          }}
          onDragEnd={endDividerDrag}
        >
          <span className="sidebar-divider-grip" aria-hidden="true" />
          <span className="sidebar-divider-rule" aria-hidden="true" />
        </button>
      </div>
    </aside>
  );
}
