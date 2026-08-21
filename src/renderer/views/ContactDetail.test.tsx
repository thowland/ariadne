import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useStore } from '../app/store';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { loadTestWorkspace, setupTestApp } from '../test-utils';

import { ContactDetail } from './ContactDetail';

beforeEach(() => {
  setupTestApp();
  loadTestWorkspace();
  useStore.setState({ view: 'contact', activeContactId: 'c1' });
});

function ws() {
  const w = useStore.getState().workspace;
  if (w === null) throw new Error('no workspace');
  return w;
}

function renderDetail() {
  return render(
    <>
      <ContactDetail />
      <ConfirmDialog />
    </>,
  );
}

describe('ContactDetail', () => {
  it('shows the person, their role, and their open load', () => {
    renderDetail();
    expect(screen.getByTestId('contact-headline')).toHaveTextContent('Dana Reyes');
    expect(screen.getByText(/Platform Lead · Northwind Systems/)).toBeInTheDocument();
    expect(screen.getByText('2 open tasks')).toBeInTheDocument();
  });

  it('edits a field in place, saving as you type', async () => {
    renderDetail();
    const phone = screen.getByLabelText('Phone');
    await userEvent.clear(phone);
    await userEvent.type(phone, '555-0000');
    expect(ws().contacts.find((c) => c.id === 'c1')?.phone).toBe('555-0000');
  });

  it('groups their tasks by project and opens both', async () => {
    renderDetail();
    // Dana's three p1 tasks, under the project's own heading.
    expect(screen.getByText('Migrate auth service')).toBeInTheDocument();
    await userEvent.click(screen.getByText('Audit legacy service dependencies'));
    expect(useStore.getState().modal).toMatchObject({ type: 'task' });

    useStore.setState({ modal: null });
    await userEvent.click(screen.getAllByText('Q3 Platform Migration')[0]!);
    expect(useStore.getState().view).toBe('project');
    expect(useStore.getState().activeProjectId).toBe('p1');
  });

  it('marks a project the contact is attached to directly', () => {
    useStore.setState({ activeContactId: 'c7' });
    renderDetail();
    expect(screen.getByText('stakeholder')).toBeInTheDocument();
    // No tasks, but the project link is real.
    expect(screen.getByText(/Attached to 1 project, but not to any task yet/)).toBeInTheDocument();
  });

  it('copies the name, email and phone from the header', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    renderDetail();
    const row = screen.getByTestId('contact-copy-row');
    await userEvent.click(within(row).getByRole('button', { name: 'Copy name' }));
    expect(writeText).toHaveBeenLastCalledWith('Dana Reyes');
    await userEvent.click(within(row).getByRole('button', { name: 'Copy phone number' }));
    expect(writeText).toHaveBeenLastCalledWith('(555) 214-8890');
    await waitFor(() => {
      expect(useStore.getState().toast).toBe('Copied phone number');
    });
  });

  it('tags a contact through the shared tag editor', async () => {
    renderDetail();
    await userEvent.type(screen.getByPlaceholderText('+ tag'), 'escalation{Enter}');
    expect(ws().contacts.find((c) => c.id === 'c1')?.tags).toEqual(['vendor', 'escalation']);
  });

  it('deletes after a confirm that says what happens to the tasks', async () => {
    renderDetail();
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
    const dialog = screen.getByRole('alertdialog', { name: 'Confirm' });
    expect(dialog).toHaveTextContent('They come off 3 tasks; the tasks themselves stay.');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));
    await waitFor(() => {
      expect(ws().contacts.some((c) => c.id === 'c1')).toBe(false);
    });
    // The tasks survive, minus the link, and we land back on the list.
    expect(ws().tasks).toHaveLength(30);
    expect(ws().tasks.every((t) => !(t.contactIds ?? []).includes('c1'))).toBe(true);
    expect(useStore.getState().view).toBe('contacts');
  });

  it('goes back to the list', async () => {
    renderDetail();
    await userEvent.click(screen.getByRole('button', { name: '← All contacts' }));
    expect(useStore.getState().view).toBe('contacts');
  });

  it('degrades to a stub when the contact is gone', () => {
    useStore.setState({ activeContactId: 'ghost' });
    renderDetail();
    expect(screen.getByText('Contact not found.')).toBeInTheDocument();
  });
});
