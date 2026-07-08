import { useEffect } from 'react';

import { useStore } from './app/store';
import { Sidebar } from './chrome/Sidebar';
import { TopBar } from './chrome/TopBar';
import { Logo } from './components/Logo';
import { CommandCenter } from './views/CommandCenter';
import { ProjectStub } from './views/ProjectStub';
import { SearchResults } from './views/SearchResults';

function StubView({ name, sprint }: { name: string; sprint: number }): React.JSX.Element {
  return (
    <div className="view-wrap fadein">
      <div className="stub-view">
        {name} arrives in Sprint {sprint}.
      </div>
    </div>
  );
}

function ViewBody(): React.JSX.Element {
  const { view, q } = useStore();
  if (q.trim() !== '') return <SearchResults />;
  switch (view) {
    case 'home':
      return <CommandCenter />;
    case 'project':
      return <ProjectStub />;
    case 'calendar':
      return <StubView name="Calendar" sprint={4} />;
    case 'reports':
      return <StubView name="Reports" sprint={6} />;
    case 'settings':
      return <StubView name="Settings" sprint={6} />;
  }
}

export function App(): React.JSX.Element {
  const { loaded, workspace, toast, warnings, load, refreshToday, showToast } = useStore();

  useEffect(() => {
    void load();
  }, [load]);

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
      {toast !== null && <div className="toast">{toast}</div>}
    </div>
  );
}
