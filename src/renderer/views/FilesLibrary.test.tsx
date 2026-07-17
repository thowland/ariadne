import { emptyWorkspace } from '@shared/types';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';

import { useStore } from '../app/store';
import { loadTestWorkspace, setupTestApp } from '../test-utils';

import { FilesLibrary } from './FilesLibrary';

beforeEach(() => {
  setupTestApp();
  loadTestWorkspace();
  useStore.setState({ view: 'files' });
});

describe('FilesLibrary', () => {
  it('lists every file grouped by project, in sidebar order', () => {
    render(<FilesLibrary />);
    // Seed: 5 files → p1 (3), p2 (1), p3 (1); p4–p6 have none.
    expect(screen.getByTestId('files-headline')).toHaveTextContent('5 files across 3 projects');
    const groups = screen.getAllByTestId(/^files-group-/);
    expect(groups.map((g) => g.getAttribute('data-testid'))).toEqual([
      'files-group-p1',
      'files-group-p2',
      'files-group-p3',
    ]);
    const p1 = screen.getByTestId('files-group-p1');
    expect(within(p1).getByText('Migration overview.md')).toBeInTheDocument();
    expect(within(p1).getByText('Rollback plan.md')).toBeInTheDocument();
    expect(within(p1).getByText('Architecture diagram')).toBeInTheDocument();
  });

  it('opens the file viewer when a row is clicked', async () => {
    render(<FilesLibrary />);
    await userEvent.click(screen.getByText('Interview findings.md'));
    expect(useStore.getState().modal).toEqual({ type: 'file', id: 'fd', back: undefined });
  });

  it('marks archived projects but still lists their files', () => {
    const w = useStore.getState().workspace!;
    useStore.setState({
      workspace: {
        ...w,
        projects: w.projects.map((p) => (p.id === 'p3' ? { ...p, archived: true } : p)),
      },
    });
    render(<FilesLibrary />);
    const p3 = screen.getByTestId('files-group-p3');
    expect(within(p3).getByText('archived')).toBeInTheDocument();
    expect(within(p3).getByText('Varnish product spec')).toBeInTheDocument();
  });

  it('shows an empty state without files', () => {
    loadTestWorkspace(emptyWorkspace());
    render(<FilesLibrary />);
    expect(screen.getByTestId('files-headline')).toHaveTextContent('No files yet');
    expect(screen.getByText(/show up here/)).toBeInTheDocument();
  });
});
