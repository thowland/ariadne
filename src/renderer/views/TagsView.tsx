import { tagUsage } from '@shared/domain/tags';

import { useStore } from '../app/store';

/**
 * All tags in the workspace at a glance. Clicking a tag searches for it —
 * the same behavior as clicking a tag chip on a project or task. Rename/
 * merge/delete stay in Settings.
 */
export function TagsView(): React.JSX.Element {
  const { workspace, setQuery } = useStore();
  const usage = workspace !== null ? tagUsage(workspace) : [];

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
              <span className="tag-cloud-count">{u.projects + u.tasks}</span>
            </button>
          ))}
        </div>
      ) : (
        <div className="card-empty">
          Add tags to projects or tasks and they will all show up here.
        </div>
      )}
    </div>
  );
}
