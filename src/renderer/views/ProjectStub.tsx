import { byProjectListOrder } from '@shared/domain/sort';

import { useStore } from '../app/store';
import { Card, CategoryPill, Dot } from '../components/primitives';
import { TaskRow } from '../components/TaskRow';

/**
 * Sprint 2 placeholder for the project workspace: header + sorted task list.
 * The full editor (notes, links, files, dependency map, task modal) lands in
 * Sprints 3–5.
 */
export function ProjectStub(): React.JSX.Element {
  const { workspace, activeProjectId } = useStore();
  const project = workspace?.projects.find((p) => p.id === activeProjectId);
  if (project === undefined) {
    return <div className="stub-view">Project not found.</div>;
  }
  const tasks = (workspace?.tasks ?? [])
    .filter((t) => t.projectId === project.id)
    .sort(byProjectListOrder);

  return (
    <div className="view-wrap fadein" style={{ maxWidth: 1180 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
        <Dot color={project.color} size={13} />
        <h1 style={{ fontSize: 23, fontWeight: 700, letterSpacing: '-0.5px', flex: 1 }}>
          {project.name}
        </h1>
        <CategoryPill category={project.category} />
      </div>
      <Card title="Tasks" count={tasks.filter((t) => t.status !== 'Dropped').length}>
        <div className="focus-section-body">
          {tasks.length > 0 ? (
            tasks.map((t) => <TaskRow key={t.id} task={t} />)
          ) : (
            <div style={{ padding: 14, color: 'var(--muted)', fontSize: 13 }}>No tasks yet.</div>
          )}
        </div>
      </Card>
      <p style={{ marginTop: 16, fontSize: 12.5, color: 'var(--faint)' }}>
        Full project workspace (notes, links, files, dependency map) arrives in Sprint 3.
      </p>
    </div>
  );
}
