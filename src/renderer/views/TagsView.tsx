import { deleteTag, renameTag, tagUsage } from '@shared/domain/tags';
import { useState } from 'react';

import { useStore } from '../app/store';
import { Card } from '../components/primitives';

/**
 * All tags in the workspace. The cloud searches on click — the same behavior
 * as clicking a tag chip on a project, task, or contact — and the management
 * list below renames (renaming onto an existing tag merges after a confirm) or
 * deletes a tag everywhere, contacts included (D31). Management moved here from Settings in v1.11: the list
 * grows with the workspace and was burying the actual settings.
 */
export function TagsView(): React.JSX.Element {
  const { workspace, setQuery, apply, askConfirm, showToast } = useStore();
  const [renaming, setRenaming] = useState<{ tag: string; value: string } | null>(null);
  const [filter, setFilter] = useState('');
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
                {managed.map((u) => (
                  <div key={u.tag} className="tag-manage-row">
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
                      <span className="tag-chip tag-manage-chip">#{u.tag}</span>
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
                ))}
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
