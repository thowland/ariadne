import type { Contact } from '../types';

import { contactName } from './contacts';

/**
 * One contact as a vCard (D49), for the address book on a phone or in
 * Outlook. Version 3.0 rather than 4.0: it is the version iOS Contacts and
 * Outlook both export themselves, and the one each reads without complaint.
 *
 * Only what the other side has a home for is written — names, organisation,
 * title, email, phone, notes and tags (as CATEGORIES). Ariadne's own links
 * (manager, tasks, projects, avatar colour) mean nothing outside it.
 */

/** RFC 2426 text escaping: backslash first, so the others are not doubled. */
function esc(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/\r\n|\r|\n/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;');
}

const encoder = new TextEncoder();

/**
 * Folds a content line at 75 octets, continuation lines starting with a
 * space. Counted in UTF-8 bytes and split only between code points, so an
 * accented name is never cut through the middle of a character.
 */
export function foldLine(line: string): string {
  const parts: string[] = [];
  let current = '';
  let bytes = 0;
  for (const ch of line) {
    const size = encoder.encode(ch).length;
    // The first line holds 75 octets; continuations lose one to the space.
    const limit = parts.length === 0 ? 75 : 74;
    if (bytes + size > limit) {
      parts.push(current);
      current = '';
      bytes = 0;
    }
    current += ch;
    bytes += size;
  }
  parts.push(current);
  return parts.join('\r\n ');
}

export function toVCard(contact: Contact): string {
  const name = contactName(contact);
  const lines = [
    'BEGIN:VCARD',
    'VERSION:3.0',
    `N:${esc(contact.lastName.trim())};${esc(contact.firstName.trim())};;;`,
    // FN is mandatory; a contact with no name still gets the placeholder the
    // app shows, rather than a card the importer rejects.
    `FN:${esc(name)}`,
  ];
  const company = contact.company.trim();
  const department = contact.department.trim();
  if (company !== '' || department !== '') {
    lines.push(`ORG:${esc(company)}${department !== '' ? `;${esc(department)}` : ''}`);
  }
  if (contact.role.trim() !== '') lines.push(`TITLE:${esc(contact.role.trim())}`);
  if (contact.email.trim() !== '') {
    lines.push(`EMAIL;TYPE=INTERNET:${esc(contact.email.trim())}`);
  }
  if (contact.phone.trim() !== '') lines.push(`TEL;TYPE=VOICE:${esc(contact.phone.trim())}`);
  if (contact.notes.trim() !== '') lines.push(`NOTE:${esc(contact.notes.trim())}`);
  if (contact.tags.length > 0) lines.push(`CATEGORIES:${contact.tags.map(esc).join(',')}`);
  lines.push('END:VCARD');
  // vCard lines end in CRLF, including the last.
  return `${lines.map(foldLine).join('\r\n')}\r\n`;
}

/** A file name for the card: the person's name, minus what file systems refuse. */
export function vCardFileName(contact: Contact): string {
  const base = contactName(contact)
    .replace(/[\\/:*?"<>|]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return `${base === '' ? 'contact' : base}.vcf`;
}
