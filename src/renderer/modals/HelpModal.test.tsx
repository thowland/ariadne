import { EXTERNAL_LINKS } from '@shared/ipc-contract';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useStore } from '../app/store';
import { loadTestWorkspace, setupTestApp } from '../test-utils';

import { HelpModal } from './HelpModal';

let api: ReturnType<typeof setupTestApp>;

beforeEach(() => {
  api = setupTestApp();
  loadTestWorkspace();
  useStore.setState({ modal: { type: 'help', section: 'start' } });
});

describe('HelpModal', () => {
  it('opens on the requested section and marks it current', () => {
    render(<HelpModal section="start" />);
    expect(screen.getByText('Ariadne in one minute')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Getting started' })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  it('switches sections from the nav', async () => {
    render(<HelpModal section="start" />);
    await userEvent.click(screen.getByRole('button', { name: 'Reports' }));
    expect(useStore.getState().modal).toEqual({ type: 'help', section: 'reports' });
  });

  it('documents every section, including the deferred report', () => {
    for (const [section, marker] of [
      ['tasks', 'The status cycle'],
      ['reports', 'The five reports'],
      ['data', 'Where your data lives'],
    ] as const) {
      const { unmount } = render(<HelpModal section={section} />);
      expect(screen.getByText(marker)).toBeInTheDocument();
      unmount();
    }
    render(<HelpModal section="reports" />);
    expect(screen.getByTestId('help-body')).toHaveTextContent('keeps sliding');
  });

  it('shows platform-correct modifier keys in the shortcuts table', async () => {
    render(<HelpModal section="shortcuts" />);
    // Default while the platform lookup is in flight, then the real answer.
    expect(await screen.findByText('Ctrl+1')).toBeInTheDocument();

    setupTestApp(undefined, {
      getAppInfo: vi.fn().mockResolvedValue({
        version: '1.14.0',
        electron: '39',
        chrome: '140',
        node: '18',
        platform: 'darwin',
        dataDir: '/tmp/data',
      }),
    });
    loadTestWorkspace();
    render(<HelpModal section="shortcuts" />);
    expect(await screen.findByText('⌘1')).toBeInTheDocument();
  });

  it('lists the archive shortcuts alongside navigation', async () => {
    render(<HelpModal section="shortcuts" />);
    const body = screen.getByTestId('help-body');
    expect(await within(body).findByText('Ctrl+⇧E')).toBeInTheDocument();
    expect(within(body).getByText('Export archive (.zip with your files)')).toBeInTheDocument();
  });

  it('links out to the issue tracker via the OS browser', async () => {
    render(<HelpModal section="start" />);
    await userEvent.click(screen.getByText('Open an issue on GitHub ↗'));
    expect(api.openExternal).toHaveBeenCalledWith(EXTERNAL_LINKS.issues);
  });

  it('closes from the × and the backdrop', async () => {
    render(<HelpModal section="start" />);
    await userEvent.click(screen.getByLabelText('Close'));
    expect(useStore.getState().modal).toBeNull();

    useStore.setState({ modal: { type: 'help', section: 'start' } });
    await userEvent.click(screen.getByTestId('help-overlay'));
    expect(useStore.getState().modal).toBeNull();
  });
});
