import { describe, expect, it } from 'vitest';

import type { Contact } from '../types';

import {
  CONTACT_CSV_COLUMNS,
  contactCsvRows,
  contactMatchKey,
  describeImportPlan,
  planContactImport,
} from './contact-csv';
import { toCsv } from './csv';
import { seedWorkspace } from './seed';

const TODAY = '2026-07-08';

function contact(patch: Partial<Contact> = {}): Contact {
  return {
    id: 'c1',
    firstName: 'Dana',
    lastName: 'Reyes',
    company: 'Northwind',
    department: 'Platform',
    role: 'Lead',
    email: 'dana@northwind.example',
    phone: '(555) 214-8890',
    notes: '',
    tags: [],
    createdAt: TODAY,
    ...patch,
  };
}

/** Header + rows, the way a spreadsheet would hand it over. */
function csv(...lines: string[]): string {
  return lines.join('\r\n') + '\r\n';
}

const HEADER = 'First Name,Last Name,Company,Department,Role,Email,Phone,Manager,Tags,Notes';

function plan(text: string, existing: readonly Contact[] = []) {
  const result = planContactImport(text, existing);
  if (!result.ok) throw new Error(`expected a plan, got: ${result.error}`);
  return result.plan;
}

describe('contactCsvRows', () => {
  it('writes the header and one row per contact, manager by name', () => {
    const rows = contactCsvRows([
      contact({ id: 'a', managerId: 'b' }),
      contact({ id: 'b', firstName: 'Aidan', lastName: 'Cross', department: '', role: 'AM' }),
    ]);
    expect(rows[0]).toEqual(CONTACT_CSV_COLUMNS.map(([, label]) => label));
    expect(rows[1]).toEqual([
      'Dana',
      'Reyes',
      'Northwind',
      'Platform',
      'Lead',
      'dana@northwind.example',
      '(555) 214-8890',
      'Aidan Cross',
      '',
      '',
    ]);
    // The top of the chart has an empty Manager cell, not a dangling id.
    expect(rows[2]?.[7]).toBe('');
  });

  it('joins tags into one cell, since commas are the delimiter', () => {
    expect(contactCsvRows([contact({ tags: ['vendor', 'escalation'] })])[1]?.[8]).toBe(
      'vendor; escalation',
    );
  });

  it('exports only the contact record, not their tasks', () => {
    const header = contactCsvRows([])[0] ?? [];
    expect(header).not.toContain('Tasks');
    expect(header).not.toContain('Projects');
  });
});

describe('planContactImport — reading a file', () => {
  it('creates everyone when the book is empty', () => {
    const p = plan(csv(HEADER, 'Ines,Barros,Northwind,Platform,SRE,ines@n.example,555,,,'));
    expect(p.creates.map((r) => r.name)).toEqual(['Ines Barros']);
    expect(p.updates).toEqual([]);
    expect(p.rowsRead).toBe(1);
  });

  it('treats the same first name, last name and company as an update', () => {
    const existing = [contact()];
    const p = plan(csv(HEADER, 'dana,REYES,northwind,,Principal Engineer,,,,,'), existing);
    expect(p.creates).toEqual([]);
    expect(p.updates).toHaveLength(1);
    expect(p.updates[0]?.existing.id).toBe('c1');
    expect(p.updates[0]?.row.fields.role).toBe('Principal Engineer');
  });

  it('a different company is a different person', () => {
    const p = plan(csv(HEADER, 'Dana,Reyes,Southwind,,,,,,,'), [contact()]);
    expect(p.updates).toEqual([]);
    expect(p.creates).toHaveLength(1);
  });

  it('folds a person listed twice in one file into a single create', () => {
    const p = plan(
      csv(HEADER, 'Ines,Barros,Northwind,,SRE,,,,,', 'Ines,Barros,Northwind,,,ines@n.example,,,,'),
    );
    expect(p.creates).toHaveLength(1);
    expect(p.creates[0]?.fields).toMatchObject({ role: 'SRE', email: 'ines@n.example' });
  });

  it('skips a row with no name at all, and says which line', () => {
    const p = plan(csv(HEADER, ',,Northwind,,,nobody@n.example,,,,', 'Ines,Barros,N,,,,,,,'));
    expect(p.skipped).toEqual([{ line: 2, reason: 'no name' }]);
    expect(p.creates).toHaveLength(1);
  });

  it('rejects a file with no name column, and an empty one', () => {
    const noName = planContactImport(csv('Company,Email', 'Northwind,a@b.c'), []);
    expect(noName.ok).toBe(false);
    if (noName.ok) return;
    expect(noName.error).toContain('No name column');
    expect(planContactImport('', [])).toEqual({ ok: false, error: 'That file is empty' });
    expect(planContactImport(csv(HEADER), [])).toEqual({
      ok: false,
      error: 'No usable contacts in that file',
    });
  });
});

describe('planContactImport — tolerating other people’s exports', () => {
  it('matches headers regardless of case, spaces, underscores or hyphens', () => {
    const p = plan(csv('first_name,LAST-NAME,Organisation,Job Title', 'Ines,Barros,Northwind,SRE'));
    expect(p.creates[0]?.fields).toMatchObject({
      firstName: 'Ines',
      lastName: 'Barros',
      company: 'Northwind',
      role: 'SRE',
    });
  });

  it('splits a single Full Name column', () => {
    const p = plan(csv('Full Name,Email', 'Ines Barros,ines@n.example'));
    expect(p.creates[0]?.fields).toMatchObject({ firstName: 'Ines', lastName: 'Barros' });
  });

  it('ignores columns it does not recognise rather than failing', () => {
    const p = plan(csv('First Name,Last Name,Employee ID', 'Ines,Barros,E-4471'));
    expect(p.creates).toHaveLength(1);
    expect(Object.values(p.creates[0]?.fields ?? {})).not.toContain('E-4471');
  });

  it('undoes the formula guard, so a "+" phone number survives a round trip', () => {
    const exported = toCsv(contactCsvRows([contact({ phone: '+1 555 214 8899' })]));
    // toCsv escapes the leading + so a spreadsheet does not read it as a formula.
    expect(exported).toContain("'+1 555 214 8899");
    const p = plan(exported);
    expect(p.creates[0]?.fields.phone).toBe('+1 555 214 8899');
  });

  it('round-trips an exported book back to the same values', () => {
    const ws = seedWorkspace(TODAY);
    const p = plan(toCsv(contactCsvRows(ws.contacts)), ws.contacts);
    // Everyone matches themselves: all updates, no creates, nothing skipped.
    expect(p.creates).toEqual([]);
    expect(p.updates).toHaveLength(ws.contacts.length);
    expect(p.skipped).toEqual([]);
    expect(p.unresolvedManagers).toEqual([]);
  });

  it('reads a note that runs over two lines', () => {
    const p = plan(csv('First Name,Notes', 'Ines,"Runs on-call.\nBased in Lisbon."'));
    expect(p.creates[0]?.fields.notes).toBe('Runs on-call.\nBased in Lisbon.');
  });
});

describe('planContactImport — fields and tags', () => {
  it('a blank cell never clears a value you already have', () => {
    const existing = [contact({ phone: '(555) 214-8890', role: 'Lead' })];
    const p = plan(csv(HEADER, 'Dana,Reyes,Northwind,,New Role,,,,,'), existing);
    const fields = p.updates[0]?.row.fields ?? {};
    expect(fields.role).toBe('New Role');
    // Phone and department were blank in the file, so they are simply absent
    // from the patch — an HR export full of empty columns must not wipe data.
    expect(fields.phone).toBeUndefined();
    expect(fields.department).toBeUndefined();
  });

  it('splits tags on semicolons or commas inside the cell, dropping a leading #', () => {
    const p = plan(csv('First Name,Tags', 'Ines,"vendor; #escalation, emea"'));
    expect(p.creates[0]?.tags).toEqual(['vendor', 'escalation', 'emea']);
  });

  it('a present-but-empty Tags column is an empty list, not "unset"', () => {
    const p = plan(csv('First Name,Tags', 'Ines,'));
    expect(p.creates[0]?.tags).toEqual([]);
    // No Tags column at all leaves tags alone.
    expect(plan(csv('First Name', 'Ines')).creates[0]?.tags).toBeUndefined();
  });
});

describe('planContactImport — managers', () => {
  it('accepts a manager who appears further down the same file', () => {
    const p = plan(csv(HEADER, 'Ines,Barros,N,,,,,Dana Reyes,,', 'Dana,Reyes,N,,,,,,,'));
    expect(p.unresolvedManagers).toEqual([]);
    expect(p.creates[0]?.managerName).toBe('Dana Reyes');
  });

  it('accepts a manager who is already a contact', () => {
    const p = plan(csv(HEADER, 'Ines,Barros,N,,,,,Dana Reyes,,'), [contact()]);
    expect(p.unresolvedManagers).toEqual([]);
  });

  it('reports a manager who matches nobody rather than inventing them', () => {
    const p = plan(csv(HEADER, 'Ines,Barros,N,,,,,Someone Missing,,'));
    expect(p.unresolvedManagers).toEqual(['Someone Missing']);
    // The row still imports — only the reporting line is dropped.
    expect(p.creates).toHaveLength(1);
  });
});

describe('describeImportPlan and contactMatchKey', () => {
  it('summarizes in the order the dialog reads', () => {
    const p = plan(csv(HEADER, 'Ines,Barros,N,,,,,,,', ',,,,,,,,,'));
    expect(describeImportPlan(p)).toBe('1 new, 0 updated, 1 skipped');
    expect(describeImportPlan(plan(csv(HEADER, 'Ines,Barros,N,,,,,,,')))).toBe('1 new, 0 updated');
  });

  it('keys on the three identity fields, case and space insensitively', () => {
    expect(contactMatchKey(' Dana ', 'REYES', 'Northwind')).toBe(
      contactMatchKey('dana', 'reyes', ' northwind'),
    );
    expect(contactMatchKey('Dana', 'Reyes', 'Northwind')).not.toBe(
      contactMatchKey('Dana', 'Reyes', 'Southwind'),
    );
  });
});
