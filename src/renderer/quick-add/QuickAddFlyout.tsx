import { todayIso } from '@shared/domain/clock';
import { defaultQuickAddProject } from '@shared/domain/quick-add';
import type { QuickAddContext } from '@shared/domain/quick-add';
import { resolveTheme } from '@shared/domain/theme';
import { useEffect, useRef, useState } from 'react';

import { getApi } from '../app/api';
import { Logo } from '../components/Logo';
import { Dot } from '../components/primitives';
import { QuickAddBox } from '../components/QuickAddBox';

/**
 * The menu-bar flyout (D51): pick a project, type a task the way the project
 * screen's quick-add takes one, press Enter. It stays open after a task is
 * added so a run of them can go in one after another; Escape, or clicking
 * anywhere else, puts it away.
 *
 * It holds no workspace. The main window sends the projects, people and tags
 * to compose with, and the finished draft goes back there to be created.
 */
export function QuickAddFlyout(): React.JSX.Element {
  const api = getApi();
  const [context, setContext] = useState<QuickAddContext | null>(null);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [today, setToday] = useState(() => todayIso(api.fakeToday ?? undefined));
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    let live = true;
    const load = (): void => {
      void api.getQuickAddContext().then((res) => {
        if (!live) return;
        setContext(res.context);
        setProjectId(
          res.context === null ? null : defaultQuickAddProject(res.context, res.lastProjectId),
        );
      });
    };
    load();
    // Each opening is a fresh start: last-used project, no stale message,
    // and the date re-read in case the flyout has sat hidden past midnight.
    api.onQuickAddShown(() => {
      if (!live) return;
      setStatus(null);
      setToday(todayIso(api.fakeToday ?? undefined));
      load();
      inputRef.current?.focus();
    });
    // Live updates while open — a project renamed or archived in the main
    // window, or a person just created by the previous quick add.
    api.onQuickAddContext((next) => {
      if (!live) return;
      setContext(next);
      setProjectId((current) =>
        current !== null && next.projects.some((p) => p.id === current)
          ? current
          : defaultQuickAddProject(next, null),
      );
    });
    return () => {
      live = false;
    };
  }, [api]);

  // Escape puts the flyout away. A picker open in the field claims Escape
  // first and stops it here, so the first press only closes the picker.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') api.hideQuickAdd();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
    };
  }, [api]);

  const themeChoice = context?.theme ?? 'system';
  useEffect(() => {
    const query = window.matchMedia('(prefers-color-scheme: dark)');
    const paint = (): void => {
      document.documentElement.dataset.theme = resolveTheme(themeChoice, query.matches);
    };
    paint();
    query.addEventListener('change', paint);
    return () => {
      query.removeEventListener('change', paint);
    };
  }, [themeChoice]);

  const project = context?.projects.find((p) => p.id === projectId);

  return (
    <div className="qa-flyout" data-testid="quick-add-flyout">
      <div className="qa-head">
        <Logo size={20} />
        <span className="qa-title">Quick add</span>
        <div className="spacer" />
        {project !== undefined && <Dot color={project.color} size={8} />}
        <select
          className="select qa-project"
          aria-label="Project"
          value={projectId ?? ''}
          disabled={context === null || context.projects.length === 0}
          onChange={(e) => {
            setProjectId(e.target.value);
            inputRef.current?.focus();
          }}
        >
          {(context?.projects ?? []).map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>
      {context === null ? (
        <div className="qa-empty">Waiting for Ariadne to load your projects…</div>
      ) : context.projects.length === 0 ? (
        <div className="qa-empty">There are no active projects to add a task to.</div>
      ) : (
        <div className="qa-body">
          <QuickAddBox
            contacts={context.contacts}
            tagVocabulary={context.tags}
            today={today}
            inputRef={inputRef}
            placeholder="A task, @ someone, # a tag, a date…"
            onSubmit={(draft) => {
              if (project === undefined) return;
              void api.submitQuickAdd({ ...draft, projectId: project.id }).then((res) => {
                setStatus(
                  res.ok
                    ? { ok: true, text: `Added “${draft.title}” to ${project.name}` }
                    : { ok: false, text: res.error },
                );
              });
            }}
          />
        </div>
      )}
      <div className={`qa-foot ${status !== null && !status.ok ? 'error' : ''}`} role="status">
        {status?.text ?? 'Enter adds the task · Esc closes'}
      </div>
    </div>
  );
}
