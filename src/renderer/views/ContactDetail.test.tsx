import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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
    expect(
      screen.getByText(/Platform Lead · Platform Engineering · Northwind Systems/),
    ).toBeInTheDocument();
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

  it('edits the department (D32)', async () => {
    renderDetail();
    const field = screen.getByLabelText('Department');
    expect(field).toHaveValue('Platform Engineering');
    await userEvent.clear(field);
    await userEvent.type(field, 'Core Platform');
    expect(ws().contacts.find((c) => c.id === 'c1')?.department).toBe('Core Platform');
  });

  it('hands the email to the OS mail client, and the number to the dialer', async () => {
    const api = setupTestApp();
    loadTestWorkspace();
    useStore.setState({ view: 'contact', activeContactId: 'c1' });
    renderDetail();

    await userEvent.click(screen.getByRole('button', { name: 'Email Dana Reyes' }));
    expect(api.openExternal).toHaveBeenLastCalledWith('mailto:dana.reyes@northwind.example');

    await userEvent.click(screen.getByRole('button', { name: 'Call Dana Reyes' }));
    // Punctuation a dialer cannot use is stripped; the digits are not.
    expect(api.openExternal).toHaveBeenLastCalledWith('tel:5552148890');
  });

  it('offers no action link for a field nobody filled in', () => {
    useStore.setState({ activeContactId: 'c7' });
    const w = ws();
    loadTestWorkspace({
      ...w,
      contacts: w.contacts.map((c) => (c.id === 'c7' ? { ...c, phone: '' } : c)),
    });
    renderDetail();
    expect(screen.getByRole('button', { name: 'Email Aidan Cross' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Call Aidan Cross' })).not.toBeInTheDocument();
  });

  it('shows the reporting line in both directions, each a link', async () => {
    useStore.setState({ activeContactId: 'c2' }); // Marcus Bell → Rachel Okonjo
    renderDetail();
    const org = screen.getByTestId('contact-org');
    expect(within(org).getByText('Rachel Okonjo')).toBeInTheDocument();
    await userEvent.click(within(org).getByText('Rachel Okonjo'));
    expect(useStore.getState().activeContactId).toBe('c8');
  });

  it('lists direct reports, derived from the other end of the same link', () => {
    useStore.setState({ activeContactId: 'c8' });
    renderDetail();
    const org = screen.getByTestId('contact-org');
    expect(org).toHaveTextContent('DIRECT REPORTS · 2');
    expect(within(org).getByText('Marcus Bell')).toBeInTheDocument();
    expect(within(org).getByText('Sofia Grant')).toBeInTheDocument();
  });

  it('sets and clears a manager', async () => {
    renderDetail(); // Dana Reyes, no manager
    await userEvent.click(screen.getByRole('button', { name: '+ Set manager' }));
    await userEvent.type(screen.getByLabelText('Set manager'), 'aidan');
    await userEvent.click(screen.getByRole('option', { name: /Aidan Cross/ }));
    expect(ws().contacts.find((c) => c.id === 'c1')?.managerId).toBe('c7');

    await userEvent.click(screen.getByRole('button', { name: 'Clear manager' }));
    expect(ws().contacts.find((c) => c.id === 'c1')?.managerId).toBeUndefined();
  });

  it('never offers the person or their reports as their own manager', async () => {
    useStore.setState({ activeContactId: 'c8' }); // manages Marcus and Sofia
    renderDetail();
    await userEvent.click(screen.getByRole('button', { name: '+ Set manager' }));
    const picker = screen.getByLabelText('Set manager');
    await userEvent.type(picker, 'a');
    // A cycle is unreachable through the UI, not merely rejected afterwards.
    expect(screen.queryByRole('option', { name: /Rachel Okonjo/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /Marcus Bell/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /Sofia Grant/ })).not.toBeInTheDocument();
    expect(screen.getByRole('option', { name: /Dana Reyes/ })).toBeInTheDocument();
  });

  it('deleting a manager leaves their reports without one, not pointing at a ghost', async () => {
    useStore.setState({ activeContactId: 'c8' });
    renderDetail();
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
    const dialog = screen.getByRole('alertdialog', { name: 'Confirm' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));
    await waitFor(() => {
      expect(ws().contacts.some((c) => c.id === 'c8')).toBe(false);
    });
    expect(ws().contacts.find((c) => c.id === 'c2')?.managerId).toBeUndefined();
  });

  it('carries the org map, and persists a hand-placed box on the contact (D34)', () => {
    useStore.setState({ activeContactId: 'c2' }); // Marcus, managed by Rachel
    renderDetail();
    expect(screen.getByTestId('org-map')).toBeInTheDocument();
    // No pinned nodes yet, so nothing to reset.
    expect(screen.queryByRole('button', { name: 'Reset layout' })).not.toBeInTheDocument();

    const node = screen.getByTestId('org-node-c8');
    fireEvent(
      node,
      new MouseEvent('pointerdown', { bubbles: true, button: 0, clientX: 0, clientY: 0 }),
    );
    fireEvent(window, new MouseEvent('pointermove', { bubbles: true, clientX: 120, clientY: 60 }));
    fireEvent(window, new MouseEvent('pointerup', { bubbles: true, clientX: 120, clientY: 60 }));

    // Saved against the contact whose map it is, not globally.
    const marcus = ws().contacts.find((c) => c.id === 'c2');
    expect(marcus?.orgLayout?.c8).toEqual({ x: 128, y: 68 });
    expect(ws().contacts.find((c) => c.id === 'c8')?.orgLayout).toBeUndefined();
  });

  it('resets a hand-placed layout back to the computed rows', async () => {
    const w = ws();
    loadTestWorkspace({
      ...w,
      contacts: w.contacts.map((c) =>
        c.id === 'c2' ? { ...c, orgLayout: { c8: { x: 400, y: 30 } } } : c,
      ),
    });
    useStore.setState({ activeContactId: 'c2' });
    renderDetail();

    await userEvent.click(screen.getByRole('button', { name: 'Reset layout' }));
    expect(ws().contacts.find((c) => c.id === 'c2')?.orgLayout).toEqual({});
  });

  it('remembers the map height on the contact', () => {
    useStore.setState({ activeContactId: 'c2' });
    renderDetail();
    const handle = screen.getByTestId('org-map-resize');
    fireEvent(handle, new MouseEvent('pointerdown', { bubbles: true, button: 0, clientY: 100 }));
    fireEvent(window, new MouseEvent('pointermove', { bubbles: true, clientY: 260 }));
    fireEvent(window, new MouseEvent('pointerup', { bubbles: true, clientY: 260 }));
    expect(ws().contacts.find((c) => c.id === 'c2')?.orgMapHeight).toBeGreaterThan(140);
  });
});
