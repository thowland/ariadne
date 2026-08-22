import { planContactImport } from '@shared/domain/contact-csv';
import type { ContactImportPlan } from '@shared/domain/contact-csv';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';

import { useStore } from '../app/store';
import { loadTestWorkspace, setupTestApp } from '../test-utils';

import { ModalHost } from './TaskModal';

beforeEach(() => {
  setupTestApp();
  loadTestWorkspace();
});

function ws() {
  const w = useStore.getState().workspace;
  if (w === null) throw new Error('no workspace');
  return w;
}

const HEADER = 'First Name,Last Name,Company,Department,Role,Email,Phone,Manager,Tags,Notes';

/** Plan a file against the seeded address book and open the review dialog. */
function open(...lines: string[]): ContactImportPlan {
  const result = planContactImport([HEADER, ...lines].join('\r\n'), ws().contacts);
  if (!result.ok) throw new Error(result.error);
  useStore.getState().openContactImport({ fileName: 'team.csv', plan: result.plan });
  render(<ModalHost />);
  return result.plan;
}

describe('ContactImportModal', () => {
  it('leads with the file and what would happen to it', () => {
    open('Ines,Barros,Northwind Systems,Platform,SRE,ines@n.example,555,,,');
    expect(screen.getByTestId('import-summary')).toHaveTextContent('team.csv');
    expect(screen.getByTestId('import-summary')).toHaveTextContent('1 row read · 1 new, 0 updated');
    expect(screen.getByText('Ines Barros')).toBeInTheDocument();
  });

  it('names the people who would be updated, with the company that matched', () => {
    open('Dana,Reyes,Northwind Systems,,Principal Engineer,,,,,');
    expect(screen.getByText('UPDATES TO PEOPLE YOU ALREADY HAVE')).toBeInTheDocument();
    expect(screen.getByText('Dana Reyes (Northwind Systems)')).toBeInTheDocument();
  });

  it('writes nothing until Import is pressed', async () => {
    const before = ws().contacts.length;
    open('Ines,Barros,Northwind Systems,,,,,,,');
    expect(ws().contacts).toHaveLength(before);

    await userEvent.click(screen.getByRole('button', { name: 'Import 1 contact' }));
    expect(ws().contacts).toHaveLength(before + 1);
    expect(useStore.getState().modal).toBeNull();
    expect(useStore.getState().toast).toBe('Imported contacts — 1 added, 0 updated');
  });

  it('cancelling leaves the address book untouched', async () => {
    const before = ws().contacts.length;
    open('Ines,Barros,Northwind Systems,,,,,,,');
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(ws().contacts).toHaveLength(before);
    expect(useStore.getState().modal).toBeNull();
  });

  it('applies an update in place rather than creating a second Dana', async () => {
    open('Dana,Reyes,Northwind Systems,,Principal Engineer,,,,,');
    const before = ws().contacts.length;
    await userEvent.click(screen.getByRole('button', { name: 'Import 1 contact' }));
    expect(ws().contacts).toHaveLength(before);
    expect(ws().contacts.find((c) => c.id === 'c1')?.role).toBe('Principal Engineer');
    expect(useStore.getState().toast).toContain('0 added, 1 updated');
  });

  it('reports manager links it established', async () => {
    open('Otto,Lindqvist,Northwind Systems,,CISO,,,Dana Reyes,,');
    await userEvent.click(screen.getByRole('button', { name: 'Import 1 contact' }));
    const otto = ws().contacts.find((c) => c.lastName === 'Lindqvist');
    expect(otto?.managerId).toBe('c1');
    expect(useStore.getState().toast).toContain('1 manager link(s)');
  });

  it('warns about a manager who matches nobody, and imports the row anyway', async () => {
    open('Otto,Lindqvist,Northwind Systems,,,,,Someone Missing,,');
    expect(screen.getByTestId('import-unresolved')).toHaveTextContent('Someone Missing');
    await userEvent.click(screen.getByRole('button', { name: 'Import 1 contact' }));
    const otto = ws().contacts.find((c) => c.lastName === 'Lindqvist');
    expect(otto).toBeDefined();
    expect(otto?.managerId).toBeUndefined();
  });

  it('lists the rows it could not use', () => {
    open(',,Northwind Systems,,,nobody@n.example,,,,', 'Ines,Barros,N,,,,,,,');
    expect(screen.getByText('SKIPPED')).toBeInTheDocument();
    expect(screen.getByText('line 2 — no name')).toBeInTheDocument();
  });

  it('spells out the matching rule, since it decides what gets overwritten', () => {
    open('Ines,Barros,N,,,,,,,');
    expect(
      screen.getByText(/Matching is on first name, last name and company/),
    ).toBeInTheDocument();
    expect(screen.getByText(/blank cell never clears/)).toBeInTheDocument();
  });
});
