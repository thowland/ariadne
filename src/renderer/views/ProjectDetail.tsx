import {
  createMarkdownFile,
  createTask,
  deleteProject,
  updateProject,
} from '@shared/domain/mutate';
import { byProjectListOrder, inPinnedOrder } from '@shared/domain/sort';
import type { IsoDate } from '@shared/types';
import { useRef, useState } from 'react';

import { getApi } from '../app/api';
import { uploadFiles } from '../app/files';
import { useStore } from '../app/store';
import { DependencyMap } from '../components/DependencyMap';
import { FileRow } from '../components/FileRow';
import { LinkListEditor } from '../components/LinkListEditor';
import { NlDateField } from '../components/NlDateField';
import { Card, Dot } from '../components/primitives';
import { TagEditor } from '../components/TagEditor';
import { TaskRow } from '../components/TaskRow';
import { UploadDropZone } from '../components/UploadDropZone';

/** The per-project workspace (prototype viewProject). */
export function ProjectDetail(): React.JSX.Element {
  const {
    workspace,
    today,
    activeProjectId,
    apply,
    openTask,
    openFile,
    go,
    askConfirm,
    showToast,
  } = useStore();
  const [quickTitle, setQuickTitle] = useState('');
  // Natural-language due date detected in the quick-add text (D29), and
  // whether the user has waved it off for what they are currently typing.
  const [quickDue, setQuickDue] = useState<IsoDate | null>(null);
  const [quickDismissed, setQuickDismissed] = useState(false);
  // The visual task order is pinned per visit so clicking the status circle
  // never reshuffles the list; it re-sorts on the next visit to the project.
  const pinnedRef = useRef<{ projectId: string; ids: string[] } | null>(null);

  const project = workspace?.projects.find((p) => p.id === activeProjectId);
  if (project === undefined) {
    return <div className="stub-view">Project not found.</div>;
  }

  const tasks = (workspace?.tasks ?? []).filter((t) => t.projectId === project.id);
  const files = (workspace?.files ?? []).filter((f) => f.projectId === project.id);
  if (pinnedRef.current?.projectId !== project.id) {
    pinnedRef.current = {
      projectId: project.id,
      ids: [...tasks].sort(byProjectListOrder).map((t) => t.id),
    };
  }
  const sorted = inPinnedOrder(tasks, pinnedRef.current.ids);
  pinnedRef.current.ids = sorted.map((t) => t.id);
  const done = tasks.filter((t) => t.status === 'Done').length;
  const total = tasks.filter((t) => t.status !== 'Dropped').length;

  const depLayout = project.depLayout ?? {};
  const moveDepNode = (taskId: string, x: number, y: number): void => {
    apply((ws) =>
      updateProject(ws, project.id, {
        depLayout: { ...depLayout, [taskId]: { x: Math.round(x), y: Math.round(y) } },
      }),
    );
  };
  const resetDepLayout = (): void => {
    apply((ws) => updateProject(ws, project.id, { depLayout: {} }));
  };

  const quickAdd = (): void => {
    const title = quickTitle.trim();
    if (title === '') return;
    // The date phrase stays in the title, as typed — it reads naturally there
    // and the due date is visible on the row anyway.
    apply((ws, ctx) => createTask(ws, ctx, project.id, { title, dueDate: quickDue }));
    setQuickTitle('');
    setQuickDue(null);
    setQuickDismissed(false);
  };

  const addAndEdit = (): void => {
    const result = apply((ws, ctx) => createTask(ws, ctx, project.id, {}));
    if (result !== null) openTask(result.id);
  };

  const remove = (): void => {
    void askConfirm('Delete this project and all its tasks?').then((ok) => {
      if (!ok) return;
      const result = apply((ws) => deleteProject(ws, project.id));
      if (result !== null && result.removedBlobIds.length > 0) {
        void getApi().deleteBlobs(result.removedBlobIds);
      }
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
            <div className="spacer" />
            <label className="archive-check">
              <input
                type="checkbox"
                checked={project.archived === true}
                aria-label="Archive this project"
                onChange={(e) => {
                  const archived = e.target.checked;
                  apply((ws) => updateProject(ws, project.id, { archived }));
                  showToast(archived ? 'Project archived' : 'Project restored');
                }}
              />
              Archive this project
            </label>
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
              <div className="inp quick-add-input">
                <NlDateField
                  value={quickTitle}
                  onChange={(next) => {
                    setQuickTitle(next);
                    // A cleared field starts a fresh task: re-arm detection.
                    if (next === '') setQuickDismissed(false);
                  }}
                  today={today}
                  onDateChange={setQuickDue}
                  dismissed={quickDismissed}
                  onDismiss={() => {
                    setQuickDismissed(true);
                  }}
                  placeholder="Add a task and press Enter…"
                  ariaLabel="Add a task"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') quickAdd();
                  }}
                />
              </div>
              <button className="btn ghost" onClick={quickAdd}>
                Add
              </button>
            </div>
          </Card>
          <Card
            title="Dependency map"
            headRight={
              <div className="lib-actions dep-head">
                {Object.keys(depLayout).length > 0 && (
                  <button className="lib-btn" onClick={resetDepLayout}>
                    Reset layout
                  </button>
                )}
                <span className="card-hint">drag to arrange · click to edit</span>
              </div>
            }
          >
            <div className="card-pad">
              <DependencyMap
                tasks={tasks}
                positions={depLayout}
                onMove={moveDepNode}
                height={project.depMapHeight}
                onResize={(h) => {
                  apply((ws) => updateProject(ws, project.id, { depMapHeight: h }));
                }}
              />
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
          <Card
            title="Files & documents"
            count={files.length}
            headRight={
              <div className="lib-actions">
                <button
                  className="lib-btn"
                  onClick={() => {
                    const result = apply((ws, ctx) =>
                      createMarkdownFile(ws, ctx, project.id, null),
                    );
                    if (result !== null) openFile(result.id, 'edit');
                  }}
                >
                  + Markdown
                </button>
                <label className="lib-btn upload-label">
                  Upload
                  <input
                    type="file"
                    multiple
                    aria-label="Upload files"
                    style={{ display: 'none' }}
                    onChange={(e) => {
                      if (e.target.files !== null) {
                        void uploadFiles(e.target.files, project.id, null);
                        e.target.value = '';
                      }
                    }}
                  />
                </label>
              </div>
            }
          >
            <div className="focus-section-body">
              {files.length > 0 ? (
                files.map((f) => <FileRow key={f.id} file={f} />)
              ) : (
                <div className="card-empty">
                  No files yet. Add a markdown note or upload reference material (PDF, CSV, DOCX,
                  XLSX, PPTX, RTF).
                </div>
              )}
            </div>
            <div className="card-pad upload-drop-pad">
              <UploadDropZone projectId={project.id} />
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
