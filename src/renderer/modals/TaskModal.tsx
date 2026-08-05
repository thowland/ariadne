import { createMarkdownFile, cycleTaskStatus, deleteTask, updateTask } from '@shared/domain/mutate';
import type { SingleTaskPushBlock } from '@shared/domain/todoist';
import {
  markTasksPushed,
  todoistMarkerOf,
  todoistPushCandidateForTask,
} from '@shared/domain/todoist';
import type { Subtask, TaskPriority, TaskStatus } from '@shared/types';
import { TASK_PRIORITIES, TASK_STATUSES } from '@shared/types';
import { useEffect, useRef, useState } from 'react';

import { getApi } from '../app/api';
import { uploadFiles } from '../app/files';
import { useStore } from '../app/store';
import { FileRow } from '../components/FileRow';
import { LinkListEditor } from '../components/LinkListEditor';
import { Dot } from '../components/primitives';
import { TagEditor } from '../components/TagEditor';
import { STATUS_COLORS } from '../styles/colors';

import { AboutModal } from './AboutModal';
import { AiImportWizard } from './AiImportWizard';
import { DayModal } from './DayModal';
import { FileViewerModal } from './FileViewerModal';
import { HelpModal } from './HelpModal';
import { MoveTasksModal } from './MoveTasksModal';

function FieldLabel({ text }: { text: string }): React.JSX.Element {
  return <div className="field-label">{text.toUpperCase()}</div>;
}

const PUSH_BLOCK_MESSAGES: Record<SingleTaskPushBlock, string> = {
  missing: 'Task no longer exists',
  'already-linked': 'This task is already in Todoist',
  'from-todoist': 'This task came from Todoist — it is already there',
  closed: 'Only open tasks can be sent to Todoist',
  'archived-project': 'Tasks in archived projects stay out of Todoist',
};

/**
 * The full task editor (prototype taskModal). Every edit auto-saves; there is
 * no explicit save. Escape and backdrop click close (Escape is handled
 * globally in App).
 */
export function TaskModal({ taskId }: { taskId: string }): React.JSX.Element | null {
  const { workspace, apply, closeModal, openFile, askConfirm, showToast } = useStore();
  const titleRef = useRef<HTMLTextAreaElement>(null);
  const [sendingToTodoist, setSendingToTodoist] = useState(false);

  const task = workspace?.tasks.find((t) => t.id === taskId);

  // Auto-grow the title textarea to its content.
  useEffect(() => {
    const el = titleRef.current;
    if (el !== null) {
      el.style.height = 'auto';
      el.style.height = `${String(el.scrollHeight)}px`;
    }
  }, [task?.title]);

  if (task === undefined || workspace === null) return null;

  const project = workspace.projects.find((p) => p.id === task.projectId);
  const siblings = workspace.tasks.filter(
    (t) => t.projectId === task.projectId && t.id !== task.id,
  );
  const st = STATUS_COLORS[task.status];
  const closed = task.status === 'Done' || task.status === 'Dropped';
  const doneSubtasks = task.subtasks.filter((s) => s.done).length;

  const patch = (fields: Parameters<typeof updateTask>[2]): void => {
    apply((ws, ctx) => updateTask(ws, task.id, fields, ctx));
  };

  const patchSubtasks = (subtasks: Subtask[]): void => {
    patch({ subtasks });
  };

  const remove = (): void => {
    void askConfirm('Delete this task?').then((ok) => {
      if (!ok) return;
      apply((ws) => deleteTask(ws, task.id));
      closeModal();
      showToast('Task deleted');
    });
  };

  const todoistLinked = todoistMarkerOf(task) !== null;

  const sendToTodoist = (): void => {
    const single = todoistPushCandidateForTask(workspace, task.id);
    if (!single.ok) {
      showToast(PUSH_BLOCK_MESSAGES[single.reason]);
      return;
    }
    setSendingToTodoist(true);
    void getApi()
      .todoistPush(workspace.settings.todoistToken, [single.candidate])
      .then((res) => {
        if (!res.ok) {
          showToast(res.error);
        } else if (res.pushed.length === 0) {
          showToast('Todoist did not accept the task — try again');
        } else {
          apply((ws) => markTasksPushed(ws, res.pushed));
          showToast('Sent to Todoist');
        }
      })
      .catch(() => {
        showToast('Todoist push failed unexpectedly — try again');
      })
      .finally(() => {
        setSendingToTodoist(false);
      });
  };

  return (
    <div className="overlay" onClick={closeModal} data-testid="task-modal-overlay">
      <div
        className="modal-panel task-modal scr"
        role="dialog"
        aria-label="Edit task"
        onClick={(e) => {
          e.stopPropagation();
        }}
      >
        <div className="modal-header">
          <button
            className="status-toggle large"
            title="Advance status"
            style={{ borderColor: st.dot, background: closed ? st.dot : 'transparent' }}
            onClick={() => {
              apply((ws, ctx) => cycleTaskStatus(ws, task.id, ctx));
            }}
          />
          <textarea
            ref={titleRef}
            className="task-title-input"
            value={task.title}
            placeholder="Task title"
            rows={1}
            onChange={(e) => {
              patch({ title: e.target.value });
            }}
          />
          <button className="modal-close" aria-label="Close" onClick={closeModal}>
            ×
          </button>
        </div>

        <div className="modal-body">
          <div className="field-grid">
            <div>
              <FieldLabel text="Project" />
              <select
                className="inp select full"
                value={task.projectId}
                aria-label="Project"
                onChange={(e) => {
                  patch({ projectId: e.target.value });
                }}
              >
                {workspace.projects
                  // Archived projects aren't move targets, but the current
                  // home must stay listed so the select shows it.
                  .filter((p) => p.archived !== true || p.id === task.projectId)
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
              </select>
            </div>
            <div>
              <FieldLabel text="Due date" />
              <input
                type="date"
                className="inp full"
                value={task.dueDate ?? ''}
                aria-label="Due date"
                onChange={(e) => {
                  patch({ dueDate: e.target.value === '' ? null : e.target.value });
                }}
              />
            </div>
            <div>
              <FieldLabel text="Status" />
              <select
                className="inp select full"
                value={task.status}
                aria-label="Status"
                onChange={(e) => {
                  patch({ status: e.target.value as TaskStatus });
                }}
              >
                {TASK_STATUSES.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </div>
            <div>
              <FieldLabel text="Priority" />
              <select
                className="inp select full"
                value={task.priority}
                aria-label="Priority"
                onChange={(e) => {
                  patch({ priority: e.target.value as TaskPriority });
                }}
              >
                {TASK_PRIORITIES.map((p) => (
                  <option key={p}>{p}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <FieldLabel text="Tags" />
            <TagEditor
              tags={task.tags}
              onChange={(tags) => {
                patch({ tags });
              }}
            />
          </div>

          <div>
            <FieldLabel text="Notes" />
            <textarea
              className="inp notes-area small"
              value={task.notes}
              placeholder="Details, context, next steps…"
              onChange={(e) => {
                patch({ notes: e.target.value });
              }}
            />
          </div>

          <div>
            <FieldLabel
              text={`Subtasks${task.subtasks.length > 0 ? ` · ${String(doneSubtasks)}/${String(task.subtasks.length)}` : ''}`}
            />
            <div className="subtask-list">
              {task.subtasks.map((sub, i) => (
                <div key={i} className="subtask-row">
                  <button
                    className={`subtask-check ${sub.done ? 'done' : ''}`}
                    aria-label={`Toggle subtask ${sub.title}`}
                    onClick={() => {
                      patchSubtasks(
                        task.subtasks.map((x, j) => (j === i ? { ...x, done: !x.done } : x)),
                      );
                    }}
                  >
                    {sub.done ? '✓' : ''}
                  </button>
                  <input
                    className={`subtask-title ${sub.done ? 'done' : ''}`}
                    value={sub.title}
                    onChange={(e) => {
                      patchSubtasks(
                        task.subtasks.map((x, j) =>
                          j === i ? { ...x, title: e.target.value } : x,
                        ),
                      );
                    }}
                  />
                  <button
                    className="subtask-remove"
                    aria-label={`Remove subtask ${sub.title}`}
                    onClick={() => {
                      patchSubtasks(task.subtasks.filter((_, j) => j !== i));
                    }}
                  >
                    ×
                  </button>
                </div>
              ))}
              <input
                className="subtask-add"
                placeholder="+ add subtask"
                onKeyDown={(e) => {
                  const value = e.currentTarget.value.trim();
                  if (e.key === 'Enter' && value !== '') {
                    patchSubtasks([...task.subtasks, { title: value, done: false }]);
                    e.currentTarget.value = '';
                  }
                }}
              />
            </div>
          </div>

          <div>
            <FieldLabel text="Blocked by (dependencies)" />
            {siblings.length > 0 ? (
              <div className="dep-list scr">
                {siblings.map((sib) => {
                  const on = task.dependsOn.includes(sib.id);
                  return (
                    <label key={sib.id} className={`dep-row ${on ? 'on' : ''}`}>
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={() => {
                          patch({
                            dependsOn: on
                              ? task.dependsOn.filter((x) => x !== sib.id)
                              : [...task.dependsOn, sib.id],
                          });
                        }}
                      />
                      <Dot color={STATUS_COLORS[sib.status].dot} size={7} />
                      <span className="dep-title">{sib.title || 'Untitled task'}</span>
                      <span className="dep-status">{sib.status}</span>
                    </label>
                  );
                })}
              </div>
            ) : (
              <div className="card-empty">No other tasks in this project yet.</div>
            )}
          </div>

          <div>
            <FieldLabel text="Attachments" />
            <div className="attachment-list">
              {workspace.files
                .filter((f) => f.taskId === task.id)
                .map((f) => (
                  <FileRow key={f.id} file={f} />
                ))}
            </div>
            <div className="attachment-actions">
              <button
                className="link-add"
                onClick={() => {
                  const result = apply((ws, ctx) =>
                    createMarkdownFile(ws, ctx, task.projectId, task.id),
                  );
                  if (result !== null) openFile(result.id, 'edit');
                }}
              >
                + Markdown note
              </button>
              <label className="link-add upload-label">
                Upload file
                <input
                  type="file"
                  multiple
                  aria-label="Upload attachment"
                  style={{ display: 'none' }}
                  onChange={(e) => {
                    if (e.target.files !== null) {
                      void uploadFiles(e.target.files, task.projectId, task.id);
                      e.target.value = '';
                    }
                  }}
                />
              </label>
            </div>
          </div>

          <div>
            <FieldLabel text="Links" />
            <LinkListEditor
              links={task.links}
              onChange={(links) => {
                patch({ links });
              }}
            />
          </div>

          <div className="modal-footer">
            <span className="modal-footnote">
              {project !== undefined ? `in ${project.name}` : ''}
            </span>
            <div className="spacer" />
            {todoistLinked ? (
              <span
                className="modal-footnote"
                data-testid="todoist-linked"
                title="This task has a todoist:<id> marker in its notes"
              >
                In Todoist ✓
              </span>
            ) : (
              <button className="btn ghost" disabled={sendingToTodoist} onClick={sendToTodoist}>
                {sendingToTodoist ? 'Sending…' : 'Send to Todoist'}
              </button>
            )}
            <button className="btn danger" onClick={remove}>
              Delete task
            </button>
            <button className="btn primary" onClick={closeModal}>
              Done
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Renders whatever modal is active. */
export function ModalHost(): React.JSX.Element | null {
  const modal = useStore((s) => s.modal);
  if (modal === null) return null;
  if (modal.type === 'file') return <FileViewerModal fileId={modal.id} />;
  if (modal.type === 'day') return <DayModal iso={modal.iso} />;
  if (modal.type === 'aiImport') return <AiImportWizard />;
  if (modal.type === 'moveTasks') return <MoveTasksModal state={modal} />;
  if (modal.type === 'about') return <AboutModal />;
  if (modal.type === 'help') return <HelpModal section={modal.section} />;
  return <TaskModal taskId={modal.id} />;
}
