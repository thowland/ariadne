import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useStore } from '../app/store';
import { loadTestWorkspace, setupTestApp } from '../test-utils';

import { ConfirmDialog } from './ConfirmDialog';
import { ContactsCard } from './ContactsCard';

beforeEach(() => {
  setupTestApp();
  loadTestWorkspace();
  useStore.setState({ view: 'project', activeProjectId: 'p1' });
});

function ws() {
  const w = useStore.getState().workspace;
  if (w === null) throw new Error('no workspace');
  return w;
}

function renderCard(projectId = 'p1') {
  return render(
    <>
      <ContactsCard projectId={projectId} />
      <ConfirmDialog />
    </>,
  );
}

describe('ContactsCard', () => {
  it('shows people attached to the project and people reached through its tasks', () => {
    renderCard();
    const list = screen.getByTestId('project-contacts');
    // Aidan is attached to p1 itself; Dana is only on its tasks.
    expect(within(list).getByText('Aidan Cross')).toBeInTheDocument();
    expect(within(list).getByText('Dana Reyes')).toBeInTheDocument();
    expect(
      within(screen.getByTestId('project-contact-c7')).getByText('project'),
    ).toBeInTheDocument();
    expect(
      within(screen.getByTestId('project-contact-c1')).getByText('3 tasks'),
    ).toBeInTheDocument();
  });

  it('keeps the details behind the twisty until it is opened', async () => {
    renderCard();
    expect(screen.queryByRole('button', { name: 'Copy email' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByLabelText('Dana Reyes — show contact details'));
    const row = screen.getByTestId('project-contact-c1');
    expect(within(row).getByText('dana.reyes@northwind.example')).toBeInTheDocument();
    expect(within(row).getByText('(555) 214-8890')).toBeInTheDocument();
  });

  it('copies the email out of the expanded row', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    renderCard();
    await userEvent.click(screen.getByLabelText('Dana Reyes — show contact details'));
    await userEvent.click(
      within(screen.getByTestId('project-contact-c1')).getByRole('button', { name: 'Copy email' }),
    );
    expect(writeText).toHaveBeenCalledWith('dana.reyes@northwind.example');
    await waitFor(() => {
      expect(useStore.getState().toast).toBe('Copied email');
    });
  });

  it('opens the contact page from the expanded row', async () => {
    renderCard();
    await userEvent.click(screen.getByLabelText('Dana Reyes — show contact details'));
    await userEvent.click(screen.getByRole('button', { name: 'Open contact' }));
    expect(useStore.getState().view).toBe('contact');
    expect(useStore.getState().activeContactId).toBe('c1');
  });

  const openPicker = async (): Promise<void> => {
    await userEvent.click(screen.getByRole('button', { name: '+ Add person' }));
  };

  it('opens a real field and lists everyone before a letter is typed', async () => {
    renderCard();
    expect(screen.queryByLabelText('Add a contact to this project')).not.toBeInTheDocument();
    await openPicker();
    const field = screen.getByLabelText('Add a contact to this project');
    expect(field).toHaveFocus();
    // A click that focuses an invisible box with no list reads as a dead
    // link; the unlinked contacts are listed straight away instead.
    expect(screen.getByRole('listbox', { name: 'Contact suggestions' })).toBeInTheDocument();
    expect(screen.getAllByRole('option').length).toBeGreaterThan(1);
    expect(screen.queryByRole('option', { name: /Dana Reyes/ })).not.toBeInTheDocument();
  });

  it('attaches an existing contact through the picker', async () => {
    renderCard();
    await openPicker();
    await userEvent.type(screen.getByLabelText('Add a contact to this project'), 'sofia');
    await userEvent.click(screen.getByRole('option', { name: /Sofia Grant/ }));
    expect(ws().projects.find((p) => p.id === 'p1')?.contactIds).toEqual(['c7', 'c6']);
    expect(useStore.getState().toast).toBe('Sofia Grant added to this project');
  });

  it('creates a brand-new person from the picker without leaving the project', async () => {
    renderCard();
    await openPicker();
    await userEvent.type(screen.getByLabelText('Add a contact to this project'), 'Nia Okoro');
    await userEvent.click(screen.getByRole('option', { name: /Add “Nia Okoro”/ }));
    const created = ws().contacts.find((c) => c.firstName === 'Nia');
    expect(created?.lastName).toBe('Okoro');
    expect(ws().projects.find((p) => p.id === 'p1')?.contactIds).toContain(created?.id);
    // Still on the project screen — creating a contact is not a navigation.
    expect(useStore.getState().view).toBe('project');
  });

  it('does not offer to create somebody who is already in the book', async () => {
    renderCard();
    await openPicker();
    await userEvent.type(screen.getByLabelText('Add a contact to this project'), 'Sofia Grant');
    expect(screen.queryByRole('option', { name: /Add “Sofia Grant”/ })).not.toBeInTheDocument();
  });

  it('detaches a directly attached person after a non-destructive confirm', async () => {
    renderCard();
    await userEvent.click(screen.getByLabelText('Aidan Cross — show contact details'));
    await userEvent.click(screen.getByRole('button', { name: 'Remove' }));
    const dialog = screen.getByRole('alertdialog', { name: 'Confirm' });
    expect(dialog).toHaveTextContent('Remove Aidan Cross from this project?');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Remove' }));
    await waitFor(() => {
      expect(ws().projects.find((p) => p.id === 'p1')?.contactIds).toEqual([]);
    });
    // The contact itself is untouched.
    expect(ws().contacts.some((c) => c.id === 'c7')).toBe(true);
  });

  it('offers no Remove for somebody who is only here through a task', async () => {
    renderCard();
    await userEvent.click(screen.getByLabelText('Dana Reyes — show contact details'));
    const row = screen.getByTestId('project-contact-c1');
    expect(within(row).queryByRole('button', { name: 'Remove' })).not.toBeInTheDocument();
    expect(within(row).getByText('2 open tasks here')).toBeInTheDocument();
  });

  it('shows the empty state on a project with nobody on it', () => {
    renderCard('p6');
    expect(screen.getByText(/Nobody linked yet/)).toBeInTheDocument();
  });

  it('offers the mail and dial actions beside the copy buttons (D32)', async () => {
    const api = setupTestApp();
    loadTestWorkspace();
    useStore.setState({ view: 'project', activeProjectId: 'p1' });
    renderCard();
    await userEvent.click(screen.getByLabelText('Dana Reyes — show contact details'));
    const row = screen.getByTestId('project-contact-c1');

    await userEvent.click(within(row).getByRole('button', { name: 'Email Dana Reyes' }));
    expect(api.openExternal).toHaveBeenLastCalledWith('mailto:dana.reyes@northwind.example');
    await userEvent.click(within(row).getByRole('button', { name: 'Call Dana Reyes' }));
    expect(api.openExternal).toHaveBeenLastCalledWith('tel:5552148890');
  });
});
