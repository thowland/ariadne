import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import { useStore } from '../app/store';
import { loadTestWorkspace, setupTestApp } from '../test-utils';

import { SearchResults } from './SearchResults';

beforeEach(() => {
  setupTestApp();
  loadTestWorkspace();
});

describe('SearchResults', () => {
  it('groups project and task matches with a summary line', () => {
    useStore.setState({ q: 'boat' });
    render(<SearchResults />);
    // Project "Refinish boat table" + task "Third coat & reattach to boat".
    expect(screen.getByTestId('search-summary')).toHaveTextContent('1 task · 1 project');
    expect(screen.getByText('PROJECTS')).toBeInTheDocument();
    expect(screen.getByTestId('project-card-p3')).toBeInTheDocument();
    expect(screen.getByText('TASKS')).toBeInTheDocument();
    expect(screen.getByText('Third coat & reattach to boat')).toBeInTheDocument();
  });

  it('matches tags too', () => {
    useStore.setState({ q: 'woodworking' });
    render(<SearchResults />);
    expect(screen.getByTestId('project-card-p3')).toBeInTheDocument();
  });

  it('shows the empty state for no matches', () => {
    useStore.setState({ q: 'zzz-nothing' });
    render(<SearchResults />);
    expect(screen.getByText('No matches.')).toBeInTheDocument();
    expect(screen.getByTestId('search-summary')).toHaveTextContent('0 tasks · 0 projects');
  });
});
