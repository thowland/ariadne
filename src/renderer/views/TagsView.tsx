import { contactName } from '@shared/domain/contacts';
import { isArchived } from '@shared/domain/derive';
import { byProjectListOrder } from '@shared/domain/sort';
import { deleteTag, renameTag, taggedWith, tagUsage } from '@shared/domain/tags';
import type { Workspace } from '@shared/types';
import { useState } from 'react';

import { useStore } from '../app/store';
import { ContactAvatar } from '../components/ContactBits';
import { Card, Dot } from '../components/primitives';
import { TaskRow } from '../components/TaskRow';

/**
 * What one tag is on (D48), opened under its row in the Manage list. The
 * cloud above still runs a search; this is the answer without leaving the
 * page, grouped by kind, and every line opens the thing it names.
 */
function TaggedItemsPanel({
  workspace,
  tag,
}: {
  workspace: Workspace;
  tag: string;
}): React.JSX.Element {
  const { openProject, openContact } = useStore();
  const { projects, tasks, contacts } = taggedWith(workspace, tag);
  const projectOrder = new Map(workspace.projects.map((p, i) => [p.id, i]));
  // Tasks grouped by project in sidebar order, then in each project's own order.
  const sortedTasks = [...tasks].sort(
    (a, b) =>
      (projectOrder.get(a.projectId) ?? 0) - (projectOrder.get(b.projectId) ?? 0) ||
      byProjectListOrder(a, b),
  );
  return (
    <div className="tag-items" data-testid={`tag-items-${tag}`}>
      {projects.length > 0 && (
        <div className="tag-items-group">
          <div className="field-label">PROJECTS</div>
          {projects.map((p) => (
            <button
              key={p.id}
              className="report-line tag-items-line"
              onClick={() => {
                openProject(p.id);
              }}
            >
              <Dot color={p.color} size={8} />
              <span className="report-line-title">{p.name}</span>
              {isArchived(p) && <span className="report-line-due muted">archived</span>}
            </button>
          ))}
        </div>
      )}
      {sortedTasks.length > 0 && (
        <div className="tag-items-group">
          <div className="field-label">TASKS</div>
          {sortedTasks.map((t) => (
            <TaskRow key={t.id} task={t} showProject />
          ))}
        </div>
      )}
      {contacts.length > 0 && (
        <div className="tag-items-group">
          <div className="field-label">CONTACTS</div>
          {contacts.map((c) => (
            <button
              key={c.id}
              className="report-line tag-items-line"
              onClick={() => {
                openContact(c.id);
              }}
            >
              <ContactAvatar contact={c} size={20} />
              <span className="report-line-title">{contactName(c)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * All tags in the workspace. The cloud searches on click — the same behavior
 * as clicking a tag chip on a project, task, or contact. In the management
 * list below, clicking a tag opens what carries it (D48), and the row
 * renames (renaming onto an existing tag merges after a confirm) or
 * deletes a tag everywhere, contacts included (D31). Management moved here from Settings in v1.11: the list
 * grows with the workspace and was burying the actual settings.
 */
export function TagsView(): React.JSX.Element {
  const { workspace, setQuery, apply, askConfirm, showToast } = useStore();
  const [renaming, setRenaming] = useState<{ tag: string; value: string } | null>(null);
  const [filter, setFilter] = useState('');
  // The one tag whose items are open under its row, compared lower-cased.
  const [openTag, setOpenTag] = useState<string | null>(null);
  const usage = workspace !== null ? tagUsage(workspace) : [];

  const needle = filter.trim().replace(/^#/, '').toLowerCase();
  const managed = needle === '' ? usage : usage.filter((u) => u.tag.toLowerCase().includes(needle));

  const commitRename = (): void => {
    if (renaming === null) return;
    const from = renaming.tag;
    const to = renaming.value.trim().replace(/^#/, '');
    setRenaming(null);
    if (to === '' || to.toLowerCase() === from.toLowerCase()) return;
    const mergesInto = usage.some((u) => u.tag.toLowerCase() === to.toLowerCase());
    const doIt = (): void => {
      apply((ws) => renameTag(ws, from, to));
      showToast(mergesInto ? `Merged #${from} into #${to}` : `Renamed #${from} to #${to}`);
    };
    if (mergesInto) {
      void askConfirm(`Merge #${from} into existing tag #${to}?`).then((ok) => {
        if (ok) doIt();
      });
    } else {
      doIt();
    }
  };

  const removeTag = (tag: string, uses: number): void => {
    void askConfirm(`Remove #${tag} from ${uses} item${uses === 1 ? '' : 's'}?`).then((ok) => {
      if (!ok) return;
      apply((ws) => deleteTag(ws, tag));
      showToast(`Deleted #${tag}`);
    });
  };

  return (
    <div className="view-wrap fadein" style={{ maxWidth: 900 }}>
      <div className="home-header">
        <div className="headline">
          <div className="eyebrow">TAGS</div>
          <h1 className="hero-title" data-testid="tags-headline">
            {usage.length > 0
              ? `${usage.length} tag${usage.length > 1 ? 's' : ''} in use`
              : 'No tags yet'}
          </h1>
        </div>
      </div>
      {usage.length > 0 ? (
        <div className="settings-stack">
          <div className="tags-cloud" data-testid="tags-cloud">
            {usage.map((u) => (
              <button
                key={u.tag}
                className="tag-chip tag-cloud-chip"
                title={`Search for #${u.tag}`}
                onClick={() => {
                  setQuery(u.tag);
                }}
              >
                <span className="tag-chip-label">#{u.tag}</span>
                <span className="tag-cloud-count">{u.projects + u.tasks + u.contacts}</span>
              </button>
            ))}
          </div>
          <Card title="Manage" count={managed.length}>
            <div className="card-pad settings-section">
              <p className="settings-copy">
                Rename to clean up variants — renaming onto an existing tag merges them — or delete
                a tag everywhere.
              </p>
              <input
                className="inp tag-filter-input"
                value={filter}
                placeholder="Filter tags…"
                aria-label="Filter tags"
                onChange={(e) => {
                  setFilter(e.target.value);
                }}
              />
              <div className="tag-manage-list" data-testid="tag-manage-list">
                {managed.map((u) => {
                  const open = openTag === u.tag.toLowerCase();
                  return (
                    <div key={u.tag} className="tag-manage-item">
                      <div className="tag-manage-row">
                        {renaming?.tag === u.tag ? (
                          <input
                            className="inp tag-rename-input"
                            value={renaming.value}
                            aria-label={`New name for ${u.tag}`}
                            autoFocus
                            onChange={(e) => {
                              setRenaming({ tag: u.tag, value: e.target.value });
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') commitRename();
                              if (e.key === 'Escape') setRenaming(null);
                            }}
                            onBlur={commitRename}
                          />
                        ) : (
                          <button
                            className="tag-chip tag-manage-chip"
                            aria-expanded={open}
                            title={
                              open ? 'Hide what carries this tag' : 'Show what carries this tag'
                            }
                            onClick={() => {
                              setOpenTag(open ? null : u.tag.toLowerCase());
                            }}
                          >
                            #{u.tag} <span className="tag-manage-twisty">{open ? '▾' : '▸'}</span>
                          </button>
                        )}
                        <span className="tag-manage-counts">
                          {[
                            u.projects > 0 && `${u.projects} project${u.projects === 1 ? '' : 's'}`,
                            u.tasks > 0 && `${u.tasks} task${u.tasks === 1 ? '' : 's'}`,
                            u.contacts > 0 && `${u.contacts} contact${u.contacts === 1 ? '' : 's'}`,
                          ]
                            .filter((x) => x !== false)
                            .join(' · ')}
                        </span>
                        <div className="spacer" />
                        <button
                          className="btn subtle"
                          onClick={() => {
                            setRenaming({ tag: u.tag, value: u.tag });
                          }}
                        >
                          Rename…
                        </button>
                        <button
                          className="btn subtle tag-delete"
                          aria-label={`Delete tag ${u.tag}`}
                          onClick={() => {
                            removeTag(u.tag, u.projects + u.tasks + u.contacts);
                          }}
                        >
                          Delete
                        </button>
                      </div>
                      {open && workspace !== null && (
                        <TaggedItemsPanel workspace={workspace} tag={u.tag} />
                      )}
                    </div>
                  );
                })}
                {managed.length === 0 && (
                  <div className="card-empty">No tags match “{filter.trim()}”.</div>
                )}
              </div>
            </div>
          </Card>
        </div>
      ) : (
        <div className="card-empty">
          Add tags to projects or tasks and they will all show up here.
        </div>
      )}
    </div>
  );
}
