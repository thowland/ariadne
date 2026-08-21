import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

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
    expect(screen.getByTestId('search-summary')).toHaveTextContent(
      '1 task · 1 project · 0 contacts',
    );
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
    expect(screen.getByTestId('search-summary')).toHaveTextContent(
      '0 tasks · 0 projects · 0 contacts',
    );
  });

  it('searches contacts too, and opens one (D31)', async () => {
    useStore.setState({ q: 'northwind' });
    render(<SearchResults />);
    expect(screen.getByTestId('search-summary')).toHaveTextContent('2 contacts');
    expect(screen.getByText('CONTACTS')).toBeInTheDocument();
    await userEvent.click(screen.getByText('Dana Reyes'));
    expect(useStore.getState().view).toBe('contact');
    expect(useStore.getState().activeContactId).toBe('c1');
  });

  it('finds someone by a phone number typed without its punctuation', () => {
    useStore.setState({ q: '5552148890' });
    render(<SearchResults />);
    expect(screen.getByText('Dana Reyes')).toBeInTheDocument();
  });

  it('copies a contact’s email straight from the results', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    useStore.setState({ q: 'Elena' });
    render(<SearchResults />);
    const row = screen.getByText('Elena Vasquez').closest<HTMLElement>('.search-contact-row');
    await userEvent.click(within(row!).getByRole('button', { name: 'Copy email' }));
    expect(writeText).toHaveBeenCalledWith('elena@vasquezcpa.example');
    await waitFor(() => {
      expect(useStore.getState().toast).toBe('Copied email');
    });
  });
});
