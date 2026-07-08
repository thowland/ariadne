import { useEffect } from 'react';

import { useStore } from './app/store';
import { Sidebar } from './chrome/Sidebar';
import { TopBar } from './chrome/TopBar';
import { ConfirmDialog } from './components/ConfirmDialog';
import { Logo } from './components/Logo';
import { ModalHost } from './modals/TaskModal';
import { Calendar } from './views/Calendar';
import { CommandCenter } from './views/CommandCenter';
import { ProjectDetail } from './views/ProjectDetail';
import { Reports } from './views/Reports';
import { SearchResults } from './views/SearchResults';
import { Settings } from './views/Settings';

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
    case 'settings':
      return <Settings />;
  }
}

export function App(): React.JSX.Element {
  const { loaded, workspace, toast, warnings, load, refreshToday, showToast } = useStore();

  useEffect(() => {
    void load();
  }, [load]);

  // Escape closes the confirm dialog first, then any open modal.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return;
      const s = useStore.getState();
      if (s.confirmState !== null) s.resolveConfirm(false);
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

  useEffect(() => {
    if (loaded && warnings.length > 0) showToast(warnings[0] ?? '');
  }, [loaded, warnings, showToast]);

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
      {toast !== null && <div className="toast">{toast}</div>}
    </div>
  );
}
