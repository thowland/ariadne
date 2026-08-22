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
    expect(screen.getByTestId('contacts-headline')).toHaveTextContent('8 contacts');
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
    expect(s.workspace?.contacts).toHaveLength(9);
    expect(s.view).toBe('contact');
    expect(s.toast).toBe('Contact created');
  });

  it('shows an empty state on a workspace with nobody in it', () => {
    loadTestWorkspace(emptyWorkspace());
    render(<Contacts />);
    expect(screen.getByTestId('contacts-headline')).toHaveTextContent('No contacts yet');
    expect(screen.queryByTestId('contacts-table')).not.toBeInTheDocument();
  });

  it('exports the whole book as CSV (D33)', async () => {
    const api = setupTestApp();
    loadTestWorkspace();
    render(<Contacts />);
    await userEvent.click(screen.getByRole('button', { name: 'Export CSV' }));

    expect(api.downloadFile).toHaveBeenCalledTimes(1);
    const request = vi.mocked(api.downloadFile).mock.calls[0]?.[0];
    expect(request?.suggestedName).toBe('ariadne-contacts-2026-07-08.csv');
    const content = request?.content ?? '';
    expect(content.split('\r\n')[0]).toBe(
      'First Name,Last Name,Company,Department,Role,Email,Phone,Manager,Tags,Notes',
    );
    expect(content).toContain('Dana,Reyes,Northwind Systems,Platform Engineering');
    // The manager travels as a name, and only contact fields are exported.
    expect(content).toContain('Rachel Okonjo');
    expect(content).not.toContain('Migrate auth service');
  });

  it('reads a picked CSV and opens the review dialog rather than importing', async () => {
    const api = setupTestApp(undefined, {
      pickCsvFile: vi.fn().mockResolvedValue({
        ok: true,
        name: 'team.csv',
        text: 'First Name,Last Name,Company\nInes,Barros,Northwind Systems\n',
      }),
    });
    loadTestWorkspace();
    const before = useStore.getState().workspace?.contacts.length ?? 0;
    render(<Contacts />);
    await userEvent.click(screen.getByRole('button', { name: 'Import CSV…' }));

    await waitFor(() => {
      expect(useStore.getState().modal).toMatchObject({
        type: 'contactImport',
        fileName: 'team.csv',
      });
    });
    expect(api.pickCsvFile).toHaveBeenCalled();
    // Still nothing written: the dialog owns that decision.
    expect(useStore.getState().workspace?.contacts).toHaveLength(before);
  });

  it('reports an unusable file instead of opening an empty dialog', async () => {
    setupTestApp(undefined, {
      pickCsvFile: vi
        .fn()
        .mockResolvedValue({ ok: true, name: 'wrong.csv', text: 'Company,Email\nAcme,a@b.c\n' }),
    });
    loadTestWorkspace();
    render(<Contacts />);
    await userEvent.click(screen.getByRole('button', { name: 'Import CSV…' }));
    await waitFor(() => {
      expect(useStore.getState().toast).toContain('No name column');
    });
    expect(useStore.getState().modal).toBeNull();
  });

  it('says nothing when the file dialog is cancelled', async () => {
    setupTestApp();
    loadTestWorkspace();
    render(<Contacts />);
    await userEvent.click(screen.getByRole('button', { name: 'Import CSV…' }));
    await waitFor(() => {
      expect(useStore.getState().modal).toBeNull();
    });
    expect(useStore.getState().toast).toBeNull();
  });

  it('filters by department as well as company and role', async () => {
    render(<Contacts />);
    await userEvent.type(screen.getByLabelText('Filter contacts'), 'infrastructure');
    expect(rowIds()).toEqual(['c2']);
  });
});
