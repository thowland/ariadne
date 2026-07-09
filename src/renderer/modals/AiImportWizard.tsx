import type { ExtractedTask } from '@shared/domain/ai-import';
import { importReviewedTask, matchProjectHint } from '@shared/domain/ai-import';
import type { TaskPriority } from '@shared/types';
import { TASK_PRIORITIES } from '@shared/types';
import { useState } from 'react';

import { getApi } from '../app/api';
import { useStore } from '../app/store';

/**
 * AI task import wizard (spec D12): paste text → Claude extracts candidate
 * tasks → review each one (edit fields, pick a project, skip) → confirmed
 * tasks are created one by one. Unmapped tasks go to the "AI Imported"
 * placeholder project.
 */

/** Value used in the project select for the placeholder target. */
const UNMAPPED = '';

interface Draft {
  title: string;
  notes: string;
  dueDate: string;
  priority: TaskPriority;
  /** '' = AI Imported placeholder. */
  projectId: string;
}

type Step =
  | { name: 'input' }
  | { name: 'busy' }
  | { name: 'review'; tasks: ExtractedTask[]; index: number; draft: Draft; added: number }
  | { name: 'done'; added: number; skipped: number };

export function AiImportWizard(): React.JSX.Element {
  const { workspace, apply, closeModal, showToast, go } = useStore();
  const [step, setStep] = useState<Step>({ name: 'input' });
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);

  const projects = workspace?.projects ?? [];
  const apiKey = workspace?.settings.anthropicApiKey ?? '';

  const draftFor = (task: ExtractedTask): Draft => ({
    title: task.title,
    notes: task.notes,
    dueDate: task.dueDate ?? '',
    priority: task.priority,
    projectId: matchProjectHint(projects, task.projectHint) ?? UNMAPPED,
  });

  const runExtract = (): void => {
    setError(null);
    if (apiKey.trim() === '') {
      setError('Add your Anthropic API key in Settings first.');
      return;
    }
    if (text.trim() === '') {
      setError('Paste some text to extract tasks from.');
      return;
    }
    setStep({ name: 'busy' });
    void getApi()
      .aiExtract({ apiKey, text, projectNames: projects.map((p) => p.name) })
      .then((res) => {
        if (!res.ok) {
          setError(res.error);
          setStep({ name: 'input' });
          return;
        }
        const first = res.tasks[0];
        if (first === undefined) {
          setError('No tasks found in that text.');
          setStep({ name: 'input' });
          return;
        }
        setStep({ name: 'review', tasks: res.tasks, index: 0, draft: draftFor(first), added: 0 });
      });
  };

  const advance = (current: Extract<Step, { name: 'review' }>, added: number): void => {
    const nextIndex = current.index + 1;
    const next = current.tasks[nextIndex];
    if (next === undefined) {
      const skipped = current.tasks.length - added;
      setStep({ name: 'done', added, skipped });
      if (added > 0) {
        showToast(`Imported ${added} task${added === 1 ? '' : 's'}`);
      }
      return;
    }
    setStep({ ...current, index: nextIndex, draft: draftFor(next), added });
  };

  const confirmCurrent = (current: Extract<Step, { name: 'review' }>): void => {
    const d = current.draft;
    apply((ws, ctx) =>
      importReviewedTask(ws, ctx, {
        title: d.title,
        notes: d.notes,
        dueDate: d.dueDate === '' ? null : d.dueDate,
        priority: d.priority,
        projectId: d.projectId === UNMAPPED ? null : d.projectId,
      }),
    );
    advance(current, current.added + 1);
  };

  const patchDraft = (current: Extract<Step, { name: 'review' }>, patch: Partial<Draft>): void => {
    setStep({ ...current, draft: { ...current.draft, ...patch } });
  };

  return (
    <div className="overlay" onClick={closeModal} data-testid="ai-import-overlay">
      <div
        className="modal-panel ai-import-modal scr"
        role="dialog"
        aria-label="AI task import"
        onClick={(e) => {
          e.stopPropagation();
        }}
      >
        <div className="modal-header">
          <div className="day-title">AI task import</div>
          <div className="spacer" />
          <button className="modal-close" aria-label="Close" onClick={closeModal}>
            ×
          </button>
        </div>

        <div className="modal-body ai-import-body">
          {step.name === 'input' && (
            <>
              <p className="settings-copy">
                Paste meeting notes, an email, or a brain dump. Claude extracts the action items;
                you review and confirm each one before it becomes a task. Unmatched tasks are filed
                under an <strong>AI Imported</strong> project until you re-file them.
              </p>
              <textarea
                className="inp ai-import-text"
                value={text}
                placeholder="Paste text with tasks in it…"
                aria-label="Text to extract tasks from"
                autoFocus
                onChange={(e) => {
                  setText(e.target.value);
                }}
              />
              {error !== null && (
                <div className="ai-import-error" role="alert">
                  {error}
                  {apiKey.trim() === '' && (
                    <>
                      {' '}
                      <button
                        className="btn subtle"
                        onClick={() => {
                          closeModal();
                          go('settings');
                        }}
                      >
                        Open Settings
                      </button>
                    </>
                  )}
                </div>
              )}
              <div className="settings-actions ai-import-actions">
                <button className="btn ghost" onClick={closeModal}>
                  Cancel
                </button>
                <button className="btn primary" onClick={runExtract}>
                  Extract tasks
                </button>
              </div>
            </>
          )}

          {step.name === 'busy' && (
            <div className="ai-import-busy" data-testid="ai-import-busy">
              Asking Claude to extract tasks…
            </div>
          )}

          {step.name === 'review' && (
            <>
              <div className="ai-import-progress" data-testid="ai-import-progress">
                Task {step.index + 1} of {step.tasks.length}
                {step.added > 0 && ` · ${step.added} added`}
              </div>
              <div>
                <div className="field-label">TITLE</div>
                <input
                  className="inp full"
                  value={step.draft.title}
                  aria-label="Task title"
                  onChange={(e) => {
                    patchDraft(step, { title: e.target.value });
                  }}
                />
              </div>
              <div className="field-grid">
                <div>
                  <div className="field-label">PROJECT</div>
                  <select
                    className="inp select full"
                    value={step.draft.projectId}
                    aria-label="Project"
                    onChange={(e) => {
                      patchDraft(step, { projectId: e.target.value });
                    }}
                  >
                    <option value={UNMAPPED}>AI Imported (unmapped)</option>
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <div className="field-label">DUE DATE</div>
                  <input
                    type="date"
                    className="inp full"
                    value={step.draft.dueDate}
                    aria-label="Due date"
                    onChange={(e) => {
                      patchDraft(step, { dueDate: e.target.value });
                    }}
                  />
                </div>
                <div>
                  <div className="field-label">PRIORITY</div>
                  <select
                    className="inp select full"
                    value={step.draft.priority}
                    aria-label="Priority"
                    onChange={(e) => {
                      patchDraft(step, { priority: e.target.value as TaskPriority });
                    }}
                  >
                    {TASK_PRIORITIES.map((p) => (
                      <option key={p}>{p}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <div className="field-label">NOTES</div>
                <textarea
                  className="inp ai-import-notes"
                  value={step.draft.notes}
                  aria-label="Task notes"
                  onChange={(e) => {
                    patchDraft(step, { notes: e.target.value });
                  }}
                />
              </div>
              <div className="settings-actions ai-import-actions">
                <button
                  className="btn ghost"
                  onClick={() => {
                    advance(step, step.added);
                  }}
                >
                  Skip
                </button>
                <button
                  className="btn primary"
                  onClick={() => {
                    confirmCurrent(step);
                  }}
                >
                  Add task
                </button>
              </div>
            </>
          )}

          {step.name === 'done' && (
            <>
              <div className="ai-import-done" data-testid="ai-import-done">
                Added {step.added} task{step.added === 1 ? '' : 's'}
                {step.skipped > 0 && `, skipped ${step.skipped}`}.
              </div>
              <div className="settings-actions ai-import-actions">
                <button className="btn primary" onClick={closeModal}>
                  Done
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
