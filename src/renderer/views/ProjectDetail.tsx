import { deleteProject, createTask, updateProject } from '@shared/domain/mutate';
import { byProjectListOrder } from '@shared/domain/sort';
import { useState } from 'react';

import { useStore } from '../app/store';
import { LinkListEditor } from '../components/LinkListEditor';
import { Card, Dot } from '../components/primitives';
import { TagEditor } from '../components/TagEditor';
import { TaskRow } from '../components/TaskRow';

/** The per-project workspace (prototype viewProject). */
export function ProjectDetail(): React.JSX.Element {
  const { workspace, activeProjectId, apply, openTask, go, askConfirm, showToast } = useStore();
  const [quickTitle, setQuickTitle] = useState('');

  const project = workspace?.projects.find((p) => p.id === activeProjectId);
  if (project === undefined) {
    return <div className="stub-view">Project not found.</div>;
  }

  const tasks = (workspace?.tasks ?? []).filter((t) => t.projectId === project.id);
  const sorted = [...tasks].sort(byProjectListOrder);
  const done = tasks.filter((t) => t.status === 'Done').length;
  const total = tasks.filter((t) => t.status !== 'Dropped').length;

  const quickAdd = (): void => {
    const title = quickTitle.trim();
    if (title === '') return;
    apply((ws, ctx) => createTask(ws, ctx, project.id, { title }));
    setQuickTitle('');
  };

  const addAndEdit = (): void => {
    const result = apply((ws, ctx) => createTask(ws, ctx, project.id, {}));
    if (result !== null) openTask(result.id);
  };

  const remove = (): void => {
    void askConfirm('Delete this project and all its tasks?').then((ok) => {
      if (!ok) return;
      apply((ws) => deleteProject(ws, project.id));
      go('home');
      showToast('Project deleted');
    });
  };

  return (
    <div className="view-wrap fadein" style={{ maxWidth: 1180 }}>
      <div className="project-header">
        <div className="project-title-block">
          <div className="project-title-row">
            <Dot color={project.color} size={13} />
            <input
              className="project-name-input"
              value={project.name}
              aria-label="Project name"
              onChange={(e) => {
                apply((ws) => updateProject(ws, project.id, { name: e.target.value }));
              }}
            />
          </div>
          <div className="project-meta-row">
            <select
              className="inp select"
              value={project.category}
              aria-label="Category"
              onChange={(e) => {
                apply((ws) =>
                  updateProject(ws, project.id, {
                    category: e.target.value === 'home' ? 'home' : 'work',
                  }),
                );
              }}
            >
              <option value="work">Work</option>
              <option value="home">Home</option>
            </select>
            <span className="project-done-count">
              {done} / {total} done
            </span>
            <TagEditor
              tags={project.tags}
              onChange={(tags) => {
                apply((ws) => updateProject(ws, project.id, { tags }));
              }}
            />
          </div>
        </div>
        <div className="project-actions">
          <button className="btn ghost" onClick={addAndEdit}>
            + Add task
          </button>
          <button className="btn danger" onClick={remove}>
            Delete
          </button>
        </div>
      </div>

      <div className="project-grid">
        <div className="project-main">
          <Card title="Tasks" count={sorted.filter((t) => t.status !== 'Dropped').length}>
            <div className="focus-section-body">
              {sorted.length > 0 ? (
                sorted.map((t) => <TaskRow key={t.id} task={t} />)
              ) : (
                <div className="card-empty">No tasks yet.</div>
              )}
            </div>
            <div className="quick-add-row">
              <input
                className="inp"
                value={quickTitle}
                placeholder="Add a task and press Enter…"
                onChange={(e) => {
                  setQuickTitle(e.target.value);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') quickAdd();
                }}
              />
              <button className="btn ghost" onClick={quickAdd}>
                Add
              </button>
            </div>
          </Card>
          <Card
            title="Dependency map"
            headRight={<span className="card-hint">click a node to edit</span>}
          >
            <div className="card-pad">
              <div className="card-empty">The dependency map arrives in Sprint 4.</div>
            </div>
          </Card>
        </div>
        <div className="project-side">
          <Card title="Notes">
            <div className="card-pad">
              <textarea
                className="inp notes-area"
                value={project.notes}
                placeholder="Context, decisions, running log…"
                onChange={(e) => {
                  apply((ws) => updateProject(ws, project.id, { notes: e.target.value }));
                }}
              />
            </div>
          </Card>
          <Card title="Links">
            <div className="card-pad">
              <LinkListEditor
                links={project.links}
                onChange={(links) => {
                  apply((ws) => updateProject(ws, project.id, { links }));
                }}
              />
            </div>
          </Card>
          <Card title="Files & documents">
            <div className="card-pad">
              <div className="card-empty">The document library arrives in Sprint 5.</div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
