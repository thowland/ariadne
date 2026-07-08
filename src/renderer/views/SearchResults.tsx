import { searchProjects, searchTasks } from '@shared/domain/search';

import { useStore } from '../app/store';
import { ProjectCard } from '../components/ProjectCard';
import { TaskRow } from '../components/TaskRow';

/** Top-bar search results (prototype viewSearch). */
export function SearchResults(): React.JSX.Element {
  const { workspace, q } = useStore();
  const projects = searchProjects(workspace?.projects ?? [], q);
  const tasks = searchTasks(workspace?.tasks ?? [], q);

  return (
    <div
      className="view-wrap fadein"
      style={{ maxWidth: 820, display: 'flex', flexDirection: 'column', gap: 16 }}
    >
      <div className="search-summary" data-testid="search-summary">
        {tasks.length} task{tasks.length !== 1 ? 's' : ''} · {projects.length} project
        {projects.length !== 1 ? 's' : ''} matching “{q.trim()}”
      </div>
      {projects.length > 0 && (
        <div>
          <div className="search-section-label">PROJECTS</div>
          <div className="search-projects-grid">
            {projects.map((p) => (
              <ProjectCard key={p.id} project={p} />
            ))}
          </div>
        </div>
      )}
      {tasks.length > 0 && (
        <div>
          <div className="search-section-label">TASKS</div>
          <div className="card">
            <div className="focus-section-body">
              {tasks.map((t) => (
                <TaskRow key={t.id} task={t} showProject />
              ))}
            </div>
          </div>
        </div>
      )}
      {projects.length === 0 && tasks.length === 0 && (
        <div className="search-empty">No matches.</div>
      )}
    </div>
  );
}
