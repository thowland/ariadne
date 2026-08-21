import { emptyWorkspace } from '@shared/types';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useStore } from '../app/store';
import { loadTestWorkspace, setupTestApp } from '../test-utils';

import { Contacts } from './Contacts';

beforeEach(() => {
  setupTestApp();
  loadTestWorkspace();
  useStore.setState({ view: 'contacts' });
});

function rowIds(): string[] {
  return within(screen.getByTestId('contacts-table'))
    .getAllByRole('row')
    .slice(1) // header
    .map((r) => r.getAttribute('data-testid')?.replace('contact-row-', '') ?? '');
}

describe('Contacts', () => {
  it('lists everyone with their counts', () => {
    render(<Contacts />);
    expect(screen.getByTestId('contacts-headline')).toHaveTextContent('7 contacts');
    const dana = screen.getByTestId('contact-row-c1');
    expect(within(dana).getByText('Dana Reyes')).toBeInTheDocument();
    expect(within(dana).getByText('Northwind Systems')).toBeInTheDocument();
    expect(within(dana).getByText('Platform Lead')).toBeInTheDocument();
  });

  it('sorts by name ascending to start, and flips the active column', async () => {
    render(<Contacts />);
    // "Last, First" ordering, so Marcus Bell leads.
    expect(rowIds()[0]).toBe('c2');
    await userEvent.click(screen.getByTitle('Sort by name'));
    expect(rowIds()[0]).not.toBe('c2');
  });

  it('sorts a count column high-to-low on first click', async () => {
    render(<Contacts />);
    await userEvent.click(screen.getByTitle('Sort by open'));
    const opens = within(screen.getByTestId('contacts-table'))
      .getAllByRole('row')
      .slice(1)
      .map((r) => Number(r.querySelectorAll('td')[3]?.textContent ?? '0'));
    expect([...opens].sort((a, b) => b - a)).toEqual(opens);
  });

  it('filters by name, company, role, or tag', async () => {
    render(<Contacts />);
    const box = screen.getByLabelText('Filter contacts');
    await userEvent.type(box, 'northwind');
    expect(rowIds()).toEqual(['c7', 'c1']);
    await userEvent.clear(box);
    await userEvent.type(box, 'recruiter');
    expect(rowIds()).toEqual(['c6']);
    await userEvent.clear(box);
    await userEvent.type(box, 'zzz');
    expect(screen.getByText(/No contacts match/)).toBeInTheDocument();
  });

  it('opens a contact by clicking its row', async () => {
    render(<Contacts />);
    await userEvent.click(screen.getByTestId('contact-row-c1'));
    expect(useStore.getState().view).toBe('contact');
    expect(useStore.getState().activeContactId).toBe('c1');
  });

  it('copies an email straight out of the list', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    render(<Contacts />);
    const dana = screen.getByTestId('contact-row-c1');
    await userEvent.click(within(dana).getByRole('button', { name: 'Copy email' }));
    expect(writeText).toHaveBeenCalledWith('dana.reyes@northwind.example');
    await waitFor(() => {
      expect(useStore.getState().toast).toBe('Copied email');
    });
  });

  it('creates a contact and goes straight to its page', async () => {
    render(<Contacts />);
    await userEvent.click(screen.getByRole('button', { name: '+ New contact' }));
    const s = useStore.getState();
    expect(s.workspace?.contacts).toHaveLength(8);
    expect(s.view).toBe('contact');
    expect(s.toast).toBe('Contact created');
  });

  it('shows an empty state on a workspace with nobody in it', () => {
    loadTestWorkspace(emptyWorkspace());
    render(<Contacts />);
    expect(screen.getByTestId('contacts-headline')).toHaveTextContent('No contacts yet');
    expect(screen.queryByTestId('contacts-table')).not.toBeInTheDocument();
  });
});
