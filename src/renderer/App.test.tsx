import { seedWorkspace } from '@shared/domain/seed';
import type { AriadneApi } from '@shared/ipc-contract';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { App } from './App';
import { useStore } from './app/store';

const TODAY = '2026-07-08';

function installApiMock(): AriadneApi {
  const api: AriadneApi = {
    loadWorkspace: vi.fn().mockResolvedValue({
      workspace: seedWorkspace(TODAY),
      warnings: [],
      firstRun: false,
    }),
    saveCollections: vi.fn().mockResolvedValue(undefined),
    getDataDir: vi.fn().mockResolvedValue({ path: '/tmp/data' }),
    openExternal: vi.fn().mockResolvedValue(undefined),
    fakeToday: TODAY,
  };
  window.ariadne = api;
  return api;
}

beforeEach(() => {
  useStore.setState({
    workspace: null,
    today: TODAY,
    loaded: false,
    firstRun: false,
    warnings: [],
  });
});

describe('App (sprint 1 debug shell)', () => {
  it('loads and summarizes the workspace', async () => {
    installApiMock();
    render(<App />);
    expect(await screen.findByTestId('workspace-summary')).toHaveTextContent(
      '6 projects · 30 tasks · 5 files',
    );
    expect(screen.getByText('Wednesday, July 8, 2026')).toBeInTheDocument();
    expect(screen.getByText(/Q3 Platform Migration/)).toBeInTheDocument();
  });

  it('adds a debug task and persists it', async () => {
    const api = installApiMock();
    render(<App />);
    await screen.findByTestId('workspace-summary');

    await userEvent.click(screen.getByRole('button', { name: 'Add debug task' }));
    expect(screen.getByTestId('workspace-summary')).toHaveTextContent('31 tasks');
    expect(api.saveCollections).toHaveBeenCalled();
  });

  it('resets to sample data', async () => {
    installApiMock();
    render(<App />);
    await screen.findByTestId('workspace-summary');

    await userEvent.click(screen.getByRole('button', { name: 'Add debug task' }));
    await userEvent.click(screen.getByRole('button', { name: 'Reset to sample data' }));
    expect(screen.getByTestId('workspace-summary')).toHaveTextContent('30 tasks');
  });

  it('shows load warnings when present', async () => {
    const api = installApiMock();
    vi.mocked(api.loadWorkspace).mockResolvedValue({
      workspace: seedWorkspace(TODAY),
      warnings: ['tasks.json restored from backup'],
      firstRun: false,
    });
    render(<App />);
    await screen.findByTestId('workspace-summary');
    expect(screen.getByTestId('load-warnings')).toHaveTextContent('restored from backup');
  });
});
