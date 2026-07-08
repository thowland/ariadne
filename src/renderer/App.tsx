import { fmtLong } from '@shared/domain/dates';
import { isOpen } from '@shared/domain/derive';
import { createTask, replaceWorkspace } from '@shared/domain/mutate';
import { seedWorkspace } from '@shared/domain/seed';
import { useEffect } from 'react';

import { useStore } from './app/store';

/**
 * Sprint 1 debug shell: proves the load → mutate → persist → reload loop
 * end-to-end. Replaced by the real global chrome + Command Center in Sprint 2.
 */
export function App(): React.JSX.Element {
  const { workspace, today, loaded, warnings, load, apply } = useStore();

  useEffect(() => {
    void load();
  }, [load]);

  if (!loaded || workspace === null) {
    return (
      <div className="shell">
        <main className="placeholder">
          <span className="brand-mark" aria-hidden="true" />
          <h1>Ariadne</h1>
          <p className="muted">Loading workspace…</p>
        </main>
      </div>
    );
  }

  const firstProject = workspace.projects[0];

  return (
    <div className="shell">
      <main className="placeholder">
        <span className="brand-mark" aria-hidden="true" />
        <h1>Ariadne</h1>
        <p>{fmtLong(today)}</p>
        <p data-testid="workspace-summary">
          {workspace.projects.length} projects · {workspace.tasks.length} tasks ·{' '}
          {workspace.files.length} files
        </p>
        {warnings.length > 0 && (
          <p className="muted" data-testid="load-warnings">
            {warnings.join(' — ')}
          </p>
        )}
        <ul className="debug-projects">
          {workspace.projects.map((p) => (
            <li key={p.id}>
              {p.name} — {workspace.tasks.filter((t) => t.projectId === p.id && isOpen(t)).length}{' '}
              open
            </li>
          ))}
        </ul>
        <p>
          <button
            onClick={() => {
              if (firstProject !== undefined) {
                apply((ws, ctx) =>
                  createTask(ws, ctx, firstProject.id, { title: `Debug task ${ctx.today}` }),
                );
              }
            }}
          >
            Add debug task
          </button>{' '}
          <button
            onClick={() => {
              apply(() => replaceWorkspace(seedWorkspace(today)));
            }}
          >
            Reset to sample data
          </button>
        </p>
        <p className="muted">Persistence online — the Command Center arrives in Sprint 2.</p>
      </main>
    </div>
  );
}
