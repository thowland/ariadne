import { updateSettings, updateTask } from '@shared/domain/mutate';
import { seedWorkspace } from '@shared/domain/seed';
import { markTasksPushed } from '@shared/domain/todoist';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { App } from './App';
import { useStore } from './app/store';
import { setupTestApp, TEST_TODAY } from './test-utils';

beforeEach(() => {
  setupTestApp();
});

describe('App shell — dock badge (D28)', () => {
  it('pushes 0 while the badge is off, so an upgrade changes nothing', async () => {
    render(<App />);
    await screen.findByTestId('home-headline');
    expect(window.ariadne.setBadge).toHaveBeenCalledWith(0);
  });

  it('pushes the overdue count when asked for one', async () => {
    render(<App />);
    await screen.findByTestId('home-headline');
    act(() => {
      useStore.getState().apply((ws) => updateSettings(ws, { badgeMode: 'overdue' }));
    });
    // The seeded workspace has 3 overdue tasks.
    await waitFor(() => {
      expect(window.ariadne.setBadge).toHaveBeenCalledWith(3);
    });
  });

  it('re-pushes when the count changes, not only at startup', async () => {
    render(<App />);
    await screen.findByTestId('home-headline');
    act(() => {
      useStore.getState().apply((ws) => updateSettings(ws, { badgeMode: 'overdue' }));
    });
    await waitFor(() => {
      expect(window.ariadne.setBadge).toHaveBeenCalledWith(3);
    });
    vi.mocked(window.ariadne.setBadge).mockClear();

    // Complete one overdue task; the badge follows without a restart.
    act(() => {
      useStore.getState().apply((ws, ctx) => updateTask(ws, 't3', { status: 'Done' }, ctx));
    });
    await waitFor(() => {
      expect(window.ariadne.setBadge).toHaveBeenCalledWith(2);
    });
  });
});

describe('App shell', () => {
  it('loads the workspace into the Command Center', async () => {
    render(<App />);
    expect(await screen.findByTestId('home-headline')).toHaveTextContent(
      /tasks? need your attention today/,
    );
    // Chrome present
    expect(screen.getByText('Ariadne')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Search tasks & projects…')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '+ New task' })).toBeInTheDocument();
  });

  it('navigates between views via the sidebar', async () => {
    render(<App />);
    await screen.findByTestId('home-headline');

    await userEvent.click(screen.getByRole('button', { name: 'Calendar' }));
    expect(screen.getByRole('heading', { name: 'July 2026' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /Command Center/ }));
    expect(screen.getByTestId('home-headline')).toBeInTheDocument();
  });

  it('opens a project from the sidebar', async () => {
    render(<App />);
    await screen.findByTestId('home-headline');

    const sidebar = screen.getByRole('navigation', { name: 'Projects' });
    await userEvent.click(within(sidebar).getByRole('button', { name: /Refinish boat table/ }));
    expect(screen.getByLabelText('Project name')).toHaveValue('Refinish boat table');
  });

  it('shows search results while a query is present and restores the view after', async () => {
    render(<App />);
    await screen.findByTestId('home-headline');

    const box = screen.getByPlaceholderText('Search tasks & projects…');
    await userEvent.type(box, 'varnish');
    expect(screen.getByTestId('search-summary')).toHaveTextContent(/matching “varnish”/);

    await userEvent.clear(box);
    expect(screen.getByTestId('home-headline')).toBeInTheDocument();
  });

  it('creates a task from the top bar and opens the editor modal', async () => {
    render(<App />);
    await screen.findByTestId('home-headline');

    await userEvent.click(screen.getByRole('button', { name: '+ New task' }));
    const dialog = screen.getByRole('dialog', { name: 'Edit task' });
    // Defaults visible; targeted the first seeded project.
    expect(within(dialog).getByLabelText('Project')).toHaveValue('p1');
    expect(within(dialog).getByPlaceholderText('Task title')).toHaveValue('');
  });

  it('Escape closes the editor modal', async () => {
    render(<App />);
    await screen.findByTestId('home-headline');
    await userEvent.click(screen.getByRole('button', { name: '+ New task' }));
    expect(screen.getByRole('dialog', { name: 'Edit task' })).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog', { name: 'Edit task' })).not.toBeInTheDocument();
  });

  it('creates a project from the sidebar +', async () => {
    render(<App />);
    await screen.findByTestId('home-headline');

    await userEvent.click(screen.getByTitle('New project'));
    expect(screen.getByLabelText('Project name')).toHaveValue('Untitled project');
  });

  it('runs the scheduled Todoist sync on launch when it is due, quietly', async () => {
    const w = seedWorkspace(TEST_TODAY);
    w.settings = { ...w.settings, todoistToken: 'tok123', todoistSyncEvery: 'hourly' };
    const marked = markTasksPushed(w, [{ taskId: 't6', todoistId: '555' }]).workspace;
    setupTestApp(marked, {
      todoistCompleted: vi.fn().mockResolvedValue({
        ok: true,
        items: [{ todoistId: '555', completedDate: '2026-07-07' }],
      }),
    });
    render(<App />);
    await screen.findByTestId('home-headline');

    await vi.waitFor(() => {
      expect(useStore.getState().workspace?.tasks.find((t) => t.id === 't6')?.status).toBe('Done');
    });
    // Auto-run with completions still announces itself; the stamp advances.
    expect(useStore.getState().toast).toBe('Marked 1 task done from Todoist');
    expect(useStore.getState().workspace?.settings.lastTodoistSyncAt).not.toBeNull();
  });

  it('does not sync on launch when the schedule is manual', async () => {
    render(<App />);
    await screen.findByTestId('home-headline');
    expect(window.ariadne.todoistCompleted).not.toHaveBeenCalled();
  });

  it('lists every load warning in a dismissable banner', async () => {
    const w = seedWorkspace(TEST_TODAY);
    setupTestApp(w, {
      loadWorkspace: vi.fn().mockResolvedValue({
        workspace: w,
        warnings: ['tasks.json restored from backup', 'files.json failed validation'],
        firstRun: false,
      }),
    });
    render(<App />);
    await screen.findByTestId('home-headline');

    const banner = screen.getByTestId('load-warnings');
    expect(banner).toHaveTextContent('tasks.json restored from backup');
    expect(banner).toHaveTextContent('files.json failed validation');

    await userEvent.click(screen.getByLabelText('Dismiss warnings'));
    expect(screen.queryByTestId('load-warnings')).not.toBeInTheDocument();
  });

  it('shows a persistent banner while disk writes fail, and clears it on recovery', async () => {
    render(<App />);
    await screen.findByTestId('home-headline');

    const pushStatus = vi.mocked(window.ariadne.onSaveStatus).mock.calls[0]?.[0];
    expect(pushStatus).toBeDefined();

    act(() => {
      pushStatus?.({ ok: false, name: 'tasks', message: 'ENOSPC' });
    });
    expect(screen.getByRole('alert')).toHaveTextContent('Changes are not being saved');

    act(() => {
      pushStatus?.({ ok: true });
    });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

describe('App — appearance (D38)', () => {
  const setTheme = (theme: 'system' | 'light' | 'dark'): void => {
    const ws = useStore.getState().workspace;
    if (ws === null) throw new Error('no workspace');
    useStore.setState({ workspace: { ...ws, settings: { ...ws.settings, theme } } });
  };

  it('paints light by default on a light system', async () => {
    setupTestApp();
    render(<App />);
    await screen.findByTestId('home-headline');
    expect(document.documentElement.dataset.theme).toBe('light');
  });

  it('honours an explicit dark choice regardless of the system', async () => {
    setupTestApp();
    render(<App />);
    await screen.findByTestId('home-headline');
    act(() => {
      setTheme('dark');
    });
    expect(document.documentElement.dataset.theme).toBe('dark');
  });

  it('follows the system when asked to, and stops when it is not', async () => {
    let listener: (() => void) | null = null;
    let prefersDark = false;
    window.matchMedia = ((query: string) => ({
      get matches() {
        return prefersDark;
      },
      media: query,
      addEventListener: (_: string, cb: () => void) => {
        listener = cb;
      },
      removeEventListener: () => {
        listener = null;
      },
    })) as unknown as typeof window.matchMedia;

    setupTestApp();
    render(<App />);
    await screen.findByTestId('home-headline');
    expect(document.documentElement.dataset.theme).toBe('light');

    // The OS flips at sunset.
    prefersDark = true;
    act(() => {
      listener?.();
    });
    expect(document.documentElement.dataset.theme).toBe('dark');

    // Pinning it light must survive the OS being dark.
    act(() => {
      setTheme('light');
    });
    expect(document.documentElement.dataset.theme).toBe('light');
  });

  it('tells the main process, so native menus and dialogs match', async () => {
    const api = setupTestApp();
    render(<App />);
    await screen.findByTestId('home-headline');
    act(() => {
      setTheme('dark');
    });
    expect(api.setNativeTheme).toHaveBeenLastCalledWith('dark');
  });
});
