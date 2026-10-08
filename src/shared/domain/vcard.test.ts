import { describe, expect, it } from 'vitest';

import type { Contact } from '../types';

import { foldLine, toVCard, vCardFileName } from './vcard';

function contact(fields: Partial<Contact> = {}): Contact {
  return {
    id: 'c1',
    firstName: 'Dana',
    lastName: 'Reyes',
    company: 'Northwind Systems',
    department: 'Platform Engineering',
    role: 'Platform Lead',
    email: 'dana@northwind.example',
    phone: '(555) 214-8890',
    notes: '',
    tags: [],
    createdAt: '2026-07-01',
    ...fields,
  };
}

describe('toVCard (D49)', () => {
  it('writes a vCard 3.0 with the fields an address book has a home for', () => {
    expect(toVCard(contact({ notes: 'Prefers Slack', tags: ['vendor', 'infra'] }))).toBe(
      [
        'BEGIN:VCARD',
        'VERSION:3.0',
        'N:Reyes;Dana;;;',
        'FN:Dana Reyes',
        'ORG:Northwind Systems;Platform Engineering',
        'TITLE:Platform Lead',
        'EMAIL;TYPE=INTERNET:dana@northwind.example',
        'TEL;TYPE=VOICE:(555) 214-8890',
        'NOTE:Prefers Slack',
        'CATEGORIES:vendor,infra',
        'END:VCARD',
        '',
      ].join('\r\n'),
    );
  });

  it('leaves blank fields out rather than writing empty properties', () => {
    const card = toVCard(
      contact({ company: '', department: '', role: '', email: '', phone: '', lastName: '' }),
    );
    expect(card).toBe('BEGIN:VCARD\r\nVERSION:3.0\r\nN:;Dana;;;\r\nFN:Dana\r\nEND:VCARD\r\n');
  });

  it('writes a department with no company as the second ORG component', () => {
    expect(toVCard(contact({ company: '' }))).toContain('ORG:;Platform Engineering\r\n');
    expect(toVCard(contact({ department: '' }))).toContain('ORG:Northwind Systems\r\n');
  });

  it('escapes the characters vCard text reserves', () => {
    const card = toVCard(
      contact({ company: 'Smith, Jones; Partners', notes: 'Line one\nC:\\temp', department: '' }),
    );
    expect(card).toContain('ORG:Smith\\, Jones\\; Partners\r\n');
    expect(card).toContain('NOTE:Line one\\nC:\\\\temp\r\n');
  });

  it('still names a contact with no name, so the importer accepts it', () => {
    expect(toVCard(contact({ firstName: '', lastName: '', company: '' }))).toContain(
      'FN:Unnamed contact\r\n',
    );
  });
});

describe('foldLine', () => {
  const bytes = (s: string) => new TextEncoder().encode(s).length;

  it('leaves a short line alone', () => {
    expect(foldLine('FN:Dana Reyes')).toBe('FN:Dana Reyes');
  });

  it('folds at 75 octets with a leading space on each continuation', () => {
    const line = `NOTE:${'x'.repeat(200)}`;
    const parts = foldLine(line).split('\r\n');
    expect(parts.length).toBeGreaterThan(1);
    for (const part of parts) expect(bytes(part)).toBeLessThanOrEqual(75);
    expect(parts.slice(1).every((p) => p.startsWith(' '))).toBe(true);
    expect(parts.map((p, i) => (i === 0 ? p : p.slice(1))).join('')).toBe(line);
  });

  it('never splits a multi-byte character', () => {
    const line = `NOTE:${'é'.repeat(100)}`;
    const parts = foldLine(line).split('\r\n');
    for (const part of parts) {
      expect(bytes(part)).toBeLessThanOrEqual(75);
      expect(part).not.toContain('�');
    }
    expect(parts.map((p, i) => (i === 0 ? p : p.slice(1))).join('')).toBe(line);
  });
});

describe('vCardFileName', () => {
  it('uses the name, minus characters a file system refuses', () => {
    expect(vCardFileName(contact())).toBe('Dana Reyes.vcf');
    expect(vCardFileName(contact({ firstName: 'A/B:', lastName: 'C?' }))).toBe('AB C.vcf');
    expect(vCardFileName(contact({ firstName: '???', lastName: '' }))).toBe('contact.vcf');
  });
});
