import { EXTERNAL_LINKS } from '@shared/ipc-contract';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useStore } from '../app/store';
import { loadTestWorkspace, setupTestApp } from '../test-utils';

import { AboutModal } from './AboutModal';

let api: ReturnType<typeof setupTestApp>;

beforeEach(() => {
  api = setupTestApp();
  loadTestWorkspace();
  useStore.setState({ modal: { type: 'about' } });
});

describe('AboutModal', () => {
  it('shows the version and runtime facts from the main process', async () => {
    render(<AboutModal />);
    expect(await screen.findByTestId('about-version')).toHaveTextContent('Version 1.14.0');
    expect(screen.getByTestId('about-runtime')).toHaveTextContent('Electron 39.8.10');
    expect(screen.getByTestId('about-runtime')).toHaveTextContent('Linux');
    expect(screen.getByText('/tmp/data')).toBeInTheDocument();
  });

  it('links to GitHub, the issue tracker, and the author site via the OS browser', async () => {
    render(<AboutModal />);
    for (const [label, url] of [
      ['Source on GitHub ↗', EXTERNAL_LINKS.github],
      ['Report an issue ↗', EXTERNAL_LINKS.issues],
      ['timhowland.com ↗', EXTERNAL_LINKS.author],
    ] as const) {
      await userEvent.click(screen.getByText(label));
      expect(api.openExternal).toHaveBeenCalledWith(url);
    }
  });

  it('copies version details to the clipboard', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    render(<AboutModal />);
    await screen.findByTestId('about-runtime');
    await userEvent.click(screen.getByText('Copy version details'));
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('Ariadne 1.14.0'));
    await waitFor(() => {
      expect(useStore.getState().toast).toBe('Version details copied');
    });
  });

  it('opens the help window from About', async () => {
    render(<AboutModal />);
    await userEvent.click(screen.getByText('Open help'));
    expect(useStore.getState().modal).toEqual({ type: 'help', section: 'start' });
  });

  it('closes from the × , the Close button, and the backdrop', async () => {
    render(<AboutModal />);
    await userEvent.click(screen.getByLabelText('Close'));
    expect(useStore.getState().modal).toBeNull();

    useStore.setState({ modal: { type: 'about' } });
    await userEvent.click(screen.getByText('Close'));
    expect(useStore.getState().modal).toBeNull();

    useStore.setState({ modal: { type: 'about' } });
    await userEvent.click(screen.getByTestId('about-overlay'));
    expect(useStore.getState().modal).toBeNull();
  });

  it('still renders when the app info lookup fails', async () => {
    setupTestApp(undefined, { getAppInfo: vi.fn().mockRejectedValue(new Error('nope')) });
    loadTestWorkspace();
    render(<AboutModal />);
    expect(await screen.findByTestId('about-version')).toHaveTextContent('Version …');
    expect(screen.queryByTestId('about-runtime')).not.toBeInTheDocument();
  });
});
