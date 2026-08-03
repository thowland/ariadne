import { todoistSyncDue } from '@shared/domain/todoist';
import { useEffect, useState } from 'react';

import { getApi } from './app/api';
import { useStore } from './app/store';
import { Sidebar } from './chrome/Sidebar';
import { TopBar } from './chrome/TopBar';
import { ConfirmDialog } from './components/ConfirmDialog';
import { ContextMenu } from './components/ContextMenu';
import { Logo } from './components/Logo';
import { ModalHost } from './modals/TaskModal';
import { Calendar } from './views/Calendar';
import { CommandCenter } from './views/CommandCenter';
import { FilesLibrary } from './views/FilesLibrary';
import { ProjectDetail } from './views/ProjectDetail';
import { Reports } from './views/Reports';
import { SearchResults } from './views/SearchResults';
import { Settings } from './views/Settings';
import { TagsView } from './views/TagsView';

function ViewBody(): React.JSX.Element {
  const { view, q } = useStore();
  if (q.trim() !== '') return <SearchResults />;
  switch (view) {
    case 'home':
      return <CommandCenter />;
    case 'project':
      return <ProjectDetail />;
    case 'calendar':
      return <Calendar />;
    case 'reports':
      return <Reports />;
    case 'files':
      return <FilesLibrary />;
    case 'tags':
      return <TagsView />;
    case 'settings':
      return <Settings />;
  }
}

export function App(): React.JSX.Element {
  const { loaded, workspace, toast, warnings, saveBroken, load, refreshToday } = useStore();
  const [warningsDismissed, setWarningsDismissed] = useState(false);

  useEffect(() => {
    void load();
  }, [load]);

  // Disk-write health pushed from the main process: show a persistent banner
  // while autosaves are failing, clear it once writing recovers.
  useEffect(() => {
    getApi().onSaveStatus((status) => {
      useStore.getState().setSaveBroken(!status.ok);
    });
  }, []);

  // Escape unwinds one layer at a time: context menu, confirm, then modal.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return;
      const s = useStore.getState();
      if (s.contextMenu !== null) s.closeContextMenu();
      else if (s.confirmState !== null) s.resolveConfirm(false);
      else if (s.modal !== null) s.closeModal();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
    };
  }, []);

  // `today` rolls over while the app sits open: refresh on focus and once a
  // minute (cheap; state only changes at midnight).
  useEffect(() => {
    const onFocus = (): void => {
      refreshToday();
    };
    window.addEventListener('focus', onFocus);
    const interval = setInterval(onFocus, 60_000);
    return () => {
      window.removeEventListener('focus', onFocus);
      clearInterval(interval);
    };
  }, [refreshToday]);

  // Scheduled Todoist completion sync (D17): check once a minute whether the
  // configured interval has elapsed; the store guards overlap and stamps the
  // attempt time.
  useEffect(() => {
    if (!loaded) return;
    const check = (): void => {
      const s = useStore.getState();
      const settings = s.workspace?.settings;
      if (settings !== undefined && todoistSyncDue(settings, new Date().toISOString())) {
        void s.runTodoistSync(true);
      }
    };
    check();
    const interval = setInterval(check, 60_000);
    return () => {
      clearInterval(interval);
    };
  }, [loaded]);

  if (!loaded || workspace === null) {
    return (
      <div className="loading-screen">
        <Logo size={48} />
        <p>Loading workspace…</p>
      </div>
    );
  }

  return (
    <div className="shell">
      <Sidebar />
      <main className="main-col">
        <TopBar />
        <div className="view-scroll scr">
          <ViewBody />
        </div>
      </main>
      <ModalHost />
      <ConfirmDialog />
      <ContextMenu />
      <div className="banner-stack">
        {saveBroken && (
          <div className="save-error-banner" role="alert">
            Changes are not being saved — check free disk space and permissions for the data folder.
            Retrying automatically; recent edits are kept in memory until a write succeeds.
          </div>
        )}
        {warnings.length > 0 && !warningsDismissed && (
          <div className="load-warning-banner" role="status" data-testid="load-warnings">
            <div>
              {warnings.map((w) => (
                <div key={w}>{w}</div>
              ))}
            </div>
            <button
              className="load-warning-dismiss"
              aria-label="Dismiss warnings"
              onClick={() => {
                setWarningsDismissed(true);
              }}
            >
              ×
            </button>
          </div>
        )}
      </div>
      {toast !== null && <div className="toast">{toast}</div>}
    </div>
  );
}
