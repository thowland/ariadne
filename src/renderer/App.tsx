import { badgeCount } from '@shared/domain/derive';
import { quickAddContext } from '@shared/domain/quick-add';
import { resolveTheme } from '@shared/domain/theme';
import { todoistSyncDue } from '@shared/domain/todoist';
import type { AriadneApi } from '@shared/ipc-contract';
import { useEffect, useState } from 'react';

import { getApi } from './app/api';
import { runMenuCommand } from './app/menu-commands';
import { receiveQuickAdd } from './app/quick-add';
import { useStore } from './app/store';
import { Sidebar } from './chrome/Sidebar';
import { TopBar } from './chrome/TopBar';
import { ConfirmDialog } from './components/ConfirmDialog';
import { ContextMenu } from './components/ContextMenu';
import { Logo } from './components/Logo';
import { ModalHost } from './modals/TaskModal';
import { Calendar } from './views/Calendar';
import { CommandCenter } from './views/CommandCenter';
import { ContactDetail } from './views/ContactDetail';
import { Contacts } from './views/Contacts';
import { FilesLibrary } from './views/FilesLibrary';
import { ProjectDetail } from './views/ProjectDetail';
import { Projects } from './views/Projects';
import { Reports } from './views/Reports';
import { SearchResults } from './views/SearchResults';
import { Settings } from './views/Settings';
import { TagsView } from './views/TagsView';

/** The bridge already listening for flyout tasks; see the effect in App. */
let quickAddListener: AriadneApi | null = null;

function ViewBody(): React.JSX.Element {
  const { view, q } = useStore();
  if (q.trim() !== '') return <SearchResults />;
  switch (view) {
    case 'home':
      return <CommandCenter />;
    case 'project':
      return <ProjectDetail />;
    case 'projects':
      return <Projects />;
    case 'calendar':
      return <Calendar />;
    case 'reports':
      return <Reports />;
    case 'contacts':
      return <Contacts />;
    case 'contact':
      return <ContactDetail />;
    case 'files':
      return <FilesLibrary />;
    case 'tags':
      return <TagsView />;
    case 'settings':
      return <Settings />;
  }
}

export function App(): React.JSX.Element {
  const { loaded, workspace, today, toast, warnings, saveBroken, load, refreshToday } = useStore();
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

  // Application-menu commands arrive as pushes from the main process.
  useEffect(() => {
    getApi().onMenuCommand(runMenuCommand);
  }, []);

  // Menu-bar quick-add (D51): tell the main process whether the icon should
  // exist, and keep the flyout's projects, people and tags current. Keyed on
  // the serialised context so an edit to a task note does not resend it.
  const quickAddOn = workspace?.settings.menuBarQuickAdd === true;
  const qaContext = workspace !== null && quickAddOn ? quickAddContext(workspace) : null;
  const qaKey = qaContext === null ? '' : JSON.stringify(qaContext);
  useEffect(() => {
    void getApi().configureQuickAdd(quickAddOn, qaContext);
    // qaKey stands in for qaContext, which is a fresh object every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quickAddOn, qaKey]);

  // Tasks composed in the flyout arrive here to be created. Registered once
  // per page: the bridge cannot unsubscribe, and React's development double
  // effect would otherwise create every task twice.
  useEffect(() => {
    const api = getApi();
    if (quickAddListener === api) return;
    quickAddListener = api;
    api.onQuickAddCommit(receiveQuickAdd);
  }, []);

  // Dock badge (D28). Recomputed from the whole workspace whenever it or the
  // date changes, so completing the last overdue task clears the badge without
  // waiting for a restart. Cheap: a count over tasks already in memory.
  const badge = workspace === null ? 0 : badgeCount(workspace, today);
  useEffect(() => {
    void getApi().setBadge(badge);
  }, [badge]);

  // Appearance (D38). The attribute on <html> is what tokens.css keys off;
  // the media query is only listened to while the choice is "system", so an
  // explicit light or dark setting is not disturbed by the OS at sunset.
  const themeChoice = workspace?.settings.theme ?? 'system';
  useEffect(() => {
    const query = window.matchMedia('(prefers-color-scheme: dark)');
    const paint = (): void => {
      const resolved = resolveTheme(themeChoice, query.matches);
      document.documentElement.dataset.theme = resolved;
      void getApi().setNativeTheme(themeChoice);
    };
    paint();
    query.addEventListener('change', paint);
    return () => {
      query.removeEventListener('change', paint);
    };
  }, [themeChoice]);

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
    <div className={`shell ${getApi().insetTitlebar ? 'inset-titlebar' : ''}`}>
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
