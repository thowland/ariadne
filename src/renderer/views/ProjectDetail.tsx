import { contactName, maskMentions } from '@shared/domain/contacts';
import { belowNode, layoutDepGraph } from '@shared/domain/dep-graph';
import { estimateTotals, formatEstimate } from '@shared/domain/estimate';
import {
  addDependency,
  createContact,
  createMarkdownFile,
  createTask,
  deleteProject,
  removeDependency,
  updateProject,
} from '@shared/domain/mutate';
import { findNlDate, stripNlDate } from '@shared/domain/nl-date';
import { byProjectListOrder, inPinnedOrder } from '@shared/domain/sort';
import type { IsoDate } from '@shared/types';
import { useRef, useState } from 'react';

import { getApi } from '../app/api';
import { uploadFiles } from '../app/files';
import { useStore } from '../app/store';
import { ContactAvatar, splitTypedName } from '../components/ContactBits';
import { ContactsCard } from '../components/ContactsCard';
import { DependencyMap } from '../components/DependencyMap';
import { FileRow } from '../components/FileRow';
import { LinkListEditor } from '../components/LinkListEditor';
import { NlDateField } from '../components/NlDateField';
import { Card, Dot } from '../components/primitives';
import { TagEditor } from '../components/TagEditor';
import { TaskRow } from '../components/TaskRow';
import { UploadDropZone } from '../components/UploadDropZone';

/**
 * Somebody @-mentioned into a quick-add task that does not exist yet. An
 * existing contact carries their id; a person named for the first time
 * carries only their name, and is not written to the address book until the
 * task is actually created — a name typed, mis-typed, or thought better of
 * before pressing Enter should leave nothing behind.
 */
interface QuickPerson {
  /** Contact id, or a provisional key for someone not created yet. */
  key: string;
  contactId: string | null;
  name: string;
}

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
  // People @-mentioned while composing the quick-add task. The task does not
  // exist yet, so the links — and any brand-new contacts — are held here and
  // only written when it is created.
  const [quickPeople, setQuickPeople] = useState<QuickPerson[]>([]);
  const provisional = useRef(0);
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
  const effort = estimateTotals(tasks);
  const done = tasks.filter((t) => t.status === 'Done').length;
  const total = tasks.filter((t) => t.status !== 'Dropped').length;

  // Hiding completed work (D30) affects this list only. The dependency map
  // still gets every task: a graph with its finished nodes removed would show
  // arrows pointing at nothing.
  const hideCompleted = project.hideCompleted === true;
  const visible = hideCompleted ? sorted.filter((t) => t.status !== 'Done') : sorted;

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

  /**
   * Dropped one box onto another (D37): the dragged task now waits on the
   * stationary one, and lands directly beneath it so the new arrow is
   * visible without hunting for it.
   */
  const linkDep = (draggedId: string, targetId: string): void => {
    const laid = layoutDepGraph(tasks, depLayout);
    const target = laid?.nodes.find((n) => n.id === targetId);
    const result = apply((ws) =>
      addDependency(ws, draggedId, targetId, target === undefined ? undefined : belowNode(target)),
    );
    if (result === null) return;
    if (result.linked) {
      showToast(`“${titleOf(draggedId)}” now waits on “${titleOf(targetId)}”`);
      return;
    }
    if (result.reason === 'cycle') showToast('That would make the two tasks wait on each other');
    else if (result.reason === 'exists') showToast('Those tasks are already linked');
  };

  // Explicit rather than `||`: an empty title must fall back too, which is
  // exactly what `??` would not do.
  const titleOf = (id: string): string => {
    const found = tasks.find((t) => t.id === id)?.title.trim();
    return found === undefined || found === '' ? 'Untitled task' : found;
  };

  const quickAdd = (): void => {
    // The date phrase comes out of the title as the task is created (D35):
    // it has done its job, and it would only contradict the due date the
    // first time the task is rescheduled.
    // maskMentions for the same reason the field does when it highlights
    // (D31 × D29): "@Tom Whitaker" is a colleague, and "tom" is an
    // abbreviation for tomorrow. The mask preserves offsets, so the match
    // still indexes into the real title for stripping.
    const found = quickDismissed ? null : findNlDate(maskMentions(quickTitle), today);
    const title = (found === null ? quickTitle : stripNlDate(quickTitle, found)).trim();
    if (title === '') return;
    // Provisional people become real contacts only now, at the moment the
    // task they were named on is committed.
    const contactIds: string[] = [];
    for (const person of quickPeople) {
      if (person.contactId !== null) {
        contactIds.push(person.contactId);
        continue;
      }
      const created = apply((ws, ctx) => createContact(ws, ctx, splitTypedName(person.name)));
      if (created !== null) contactIds.push(created.id);
    }
    // The date phrase stays in the title, as typed — it reads naturally there
    // and the due date is visible on the row anyway.
    apply((ws, ctx) =>
      createTask(ws, ctx, project.id, {
        title,
        dueDate: quickDue,
        ...(contactIds.length > 0 ? { contactIds } : {}),
      }),
    );
    setQuickTitle('');
    setQuickDue(null);
    setQuickDismissed(false);
    setQuickPeople([]);
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
            {(effort.open > 0 || effort.total > 0) && (
              <span
                className="project-effort"
                data-testid="project-effort"
                title={`${formatEstimate(effort.total) || '0h'} estimated in total${
                  effort.unestimated > 0
                    ? `; ${String(effort.unestimated)} open task(s) with no estimate`
                    : ''
                }`}
              >
                {formatEstimate(effort.open) || '0h'} left
                {effort.unestimated > 0 && (
                  <span className="project-effort-gap">+{effort.unestimated} unestimated</span>
                )}
              </span>
            )}
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
          <Card
            title="Tasks"
            count={visible.filter((t) => t.status !== 'Dropped').length}
            headRight={
              done > 0 ? (
                <label className="card-toggle" title="Remembered for this project">
                  <input
                    type="checkbox"
                    checked={hideCompleted}
                    aria-label="Hide completed tasks"
                    onChange={(e) => {
                      apply((ws) =>
                        updateProject(ws, project.id, { hideCompleted: e.target.checked }),
                      );
                    }}
                  />
                  Hide {done} completed
                </label>
              ) : undefined
            }
          >
            <div className="focus-section-body">
              {visible.length > 0 ? (
                visible.map((t) => <TaskRow key={t.id} task={t} />)
              ) : hideCompleted && sorted.length > 0 ? (
                <div className="card-empty">
                  Everything here is done. Untick “Hide {done} completed” to see it.
                </div>
              ) : (
                <div className="card-empty">No tasks yet.</div>
              )}
            </div>
            {quickPeople.length > 0 && (
              <div className="quick-add-people" data-testid="quick-add-people">
                {quickPeople.map((person) => {
                  const c =
                    person.contactId === null
                      ? undefined
                      : workspace?.contacts.find((x) => x.id === person.contactId);
                  return (
                    <span
                      key={person.key}
                      className={`contact-chip ${c === undefined ? 'pending' : ''}`}
                    >
                      <span className="contact-chip-label">
                        {c !== undefined && <ContactAvatar contact={c} size={18} />}
                        {person.name}
                        {/* Says out loud that nobody has been added yet. */}
                        {c === undefined && <span className="contact-chip-new">new</span>}
                      </span>
                      <button
                        aria-label={`Remove ${person.name}`}
                        onClick={() => {
                          setQuickPeople((list) => list.filter((p) => p.key !== person.key));
                        }}
                      >
                        ×
                      </button>
                    </span>
                  );
                })}
              </div>
            )}
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
                  placeholder="Add a task, or @ someone, and press Enter…"
                  ariaLabel="Add a task"
                  mentionContacts={workspace?.contacts ?? []}
                  mentionExclude={quickPeople
                    .map((p) => p.contactId)
                    .filter((id): id is string => id !== null)}
                  onCreateContact={(name) => {
                    // Hold them, don't create them. The key stands in for a
                    // contact id until the task exists.
                    const existing = quickPeople.find(
                      (p) => p.contactId === null && p.name.toLowerCase() === name.toLowerCase(),
                    );
                    if (existing !== undefined) return existing.key;
                    provisional.current += 1;
                    const key = `pending:${String(provisional.current)}`;
                    setQuickPeople((list) => [...list, { key, contactId: null, name }]);
                    return key;
                  }}
                  onMention={(contactId) => {
                    setQuickPeople((list) => {
                      // A provisional person was appended by onCreateContact.
                      if (list.some((p) => p.key === contactId)) return list;
                      const c = workspace?.contacts.find((x) => x.id === contactId);
                      if (c === undefined) return list;
                      return [...list, { key: contactId, contactId, name: contactName(c) }];
                    });
                  }}
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
                onLink={linkDep}
                onUnlink={(taskId, dependsOnId) => {
                  apply((ws) => removeDependency(ws, taskId, dependsOnId));
                  showToast('Dependency removed');
                }}
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
          <ContactsCard projectId={project.id} />
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
