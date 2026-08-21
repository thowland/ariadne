import { describe, expect, it } from 'vitest';

import type { Contact, Workspace } from '../types';
import { emptyWorkspace, PROJECT_PALETTE } from '../types';

import {
  contactColor,
  contactInitials,
  contactName,
  contactRollup,
  contactSortName,
  contactsOfTask,
  findMention,
  maskMentions,
  mentionCandidates,
  projectContacts,
  projectsOfContact,
  completeMention,
  searchContacts,
  sortContacts,
  suggestContacts,
  tasksOfContact,
} from './contacts';
import { seedWorkspace } from './seed';

const TODAY = '2026-07-08';

function contact(patch: Partial<Contact> = {}): Contact {
  return {
    id: 'c1',
    firstName: 'Dana',
    lastName: 'Reyes',
    company: 'Northwind',
    role: 'Platform Lead',
    email: 'dana@northwind.example',
    phone: '(555) 214-8890',
    notes: '',
    tags: [],
    createdAt: '2026-06-01',
    ...patch,
  };
}

describe('names and identity', () => {
  it('joins first and last, and falls back through company', () => {
    expect(contactName(contact())).toBe('Dana Reyes');
    expect(contactName(contact({ lastName: '' }))).toBe('Dana');
    expect(contactName(contact({ firstName: ' ', lastName: ' ' }))).toBe('Northwind');
    expect(contactName(contact({ firstName: '', lastName: '', company: '' }))).toBe(
      'Unnamed contact',
    );
  });

  it('sorts on "Last, First" when both halves exist', () => {
    expect(contactSortName(contact())).toBe('reyes, dana');
    // Only one half recorded: fall back to the display name, not "", so a
    // half-filled contact still lands somewhere sensible in the list.
    expect(contactSortName(contact({ lastName: '' }))).toBe('dana');
  });

  it('derives initials, and never returns nothing', () => {
    expect(contactInitials(contact())).toBe('DR');
    expect(contactInitials(contact({ lastName: '' }))).toBe('D');
    expect(contactInitials(contact({ firstName: '', lastName: '', company: 'acme' }))).toBe('A');
    expect(contactInitials(contact({ firstName: '', lastName: '', company: '' }))).toBe('U');
  });

  it('picks a palette colour that is stable for an id', () => {
    const a = contactColor(contact({ id: 'abc' }), PROJECT_PALETTE);
    expect(PROJECT_PALETTE).toContain(a);
    expect(contactColor(contact({ id: 'abc', firstName: 'Renamed' }), PROJECT_PALETTE)).toBe(a);
  });
});

describe('the project ↔ contact join', () => {
  const ws = seedWorkspace(TODAY);

  it('unions the project’s own contacts with everyone on its tasks', () => {
    const rows = projectContacts(ws, 'p1');
    const ids = rows.map((r) => r.contact.id);
    // c7 is attached to the project directly and has no task of his own;
    // c1/c2 are only reachable through tasks.
    expect(ids).toContain('c7');
    expect(ids).toContain('c1');
    expect(ids).toContain('c2');
    expect(rows.find((r) => r.contact.id === 'c7')?.source).toBe('direct');
    expect(rows.find((r) => r.contact.id === 'c1')?.source).toBe('task');
  });

  it('leads with directly attached people, then by task count', () => {
    const rows = projectContacts(ws, 'p1');
    expect(rows[0]?.contact.id).toBe('c7');
    const taskSourced = rows.filter((r) => r.source === 'task').map((r) => r.totalTasks);
    expect([...taskSourced].sort((a, b) => b - a)).toEqual(taskSourced);
  });

  it('counts open tasks separately from all tasks', () => {
    const dana = projectContacts(ws, 'p1').find((r) => r.contact.id === 'c1');
    // Three tasks on p1: the audit (Done) plus two open ones.
    expect(dana?.totalTasks).toBe(3);
    expect(dana?.openTasks).toBe(2);
  });

  it('is empty for an unknown project', () => {
    expect(projectContacts(ws, 'nope')).toEqual([]);
  });

  it('resolves a task’s contacts, tolerating an absent list', () => {
    const provision = ws.tasks.find((t) => t.title === 'Provision new k8s cluster');
    expect(contactsOfTask(ws, provision as never).map(contactName)).toEqual([
      'Dana Reyes',
      'Marcus Bell',
    ]);
    const untouched = ws.tasks.find((t) => t.contactIds === undefined);
    expect(contactsOfTask(ws, untouched as never)).toEqual([]);
  });

  it('lists a contact’s tasks and projects, direct attachments included', () => {
    expect(tasksOfContact(ws, 'c6')).toHaveLength(3);
    // c7 has no tasks at all, but is attached to p1.
    expect(tasksOfContact(ws, 'c7')).toEqual([]);
    expect(projectsOfContact(ws, 'c7').map((p) => p.id)).toEqual(['p1']);
    // c4 is on p4 both directly and through two tasks — listed once.
    expect(projectsOfContact(ws, 'c4').map((p) => p.id)).toEqual(['p4']);
  });
});

describe('contactRollup and sortContacts', () => {
  const ws = seedWorkspace(TODAY);
  const rows = contactRollup(ws, TODAY);

  it('counts open, done, overdue and projects per contact', () => {
    const dana = rows.find((r) => r.contact.id === 'c1');
    expect(dana).toMatchObject({ open: 2, done: 1, projects: 1 });
    // "Migrate auth service" is open and a day past due.
    expect(dana?.overdue).toBe(1);
  });

  it('reports the latest activity date, or null for nobody with tasks', () => {
    expect(rows.find((r) => r.contact.id === 'c1')?.lastActivity).not.toBeNull();
    expect(rows.find((r) => r.contact.id === 'c7')?.lastActivity).toBeNull();
  });

  it('sorts by a column with the name as a total-order tie-break', () => {
    const byOpen = sortContacts(rows, 'open', 'desc');
    expect(byOpen[0]?.open).toBeGreaterThanOrEqual(byOpen[1]?.open ?? 0);
    // Ties fall back to the sort name in both directions.
    const zeros = sortContacts(rows, 'projects', 'asc').filter((r) => r.projects === 0);
    expect(zeros.map((r) => contactSortName(r.contact))).toEqual(
      [...zeros.map((r) => contactSortName(r.contact))].sort(),
    );
  });

  it('sinks contacts with no activity in both directions', () => {
    const idOf = (dir: 'asc' | 'desc'): string[] =>
      sortContacts(rows, 'last', dir)
        .filter((r) => r.lastActivity === null)
        .map((r) => r.contact.id);
    const asc = sortContacts(rows, 'last', 'asc');
    const desc = sortContacts(rows, 'last', 'desc');
    expect(asc[asc.length - 1]?.lastActivity).toBeNull();
    expect(desc[desc.length - 1]?.lastActivity).toBeNull();
    expect(idOf('asc')).toEqual(idOf('desc'));
  });

  it('is not just a reversed array when the direction flips', () => {
    const asc = sortContacts(rows, 'name', 'asc').map((r) => r.contact.id);
    const desc = sortContacts(rows, 'name', 'desc').map((r) => r.contact.id);
    expect(desc).toEqual([...asc].reverse());
    // …but the "last activity" column is not, because nulls stay put.
    const lastAsc = sortContacts(rows, 'last', 'asc').map((r) => r.contact.id);
    const lastDesc = sortContacts(rows, 'last', 'desc').map((r) => r.contact.id);
    expect(lastDesc).not.toEqual([...lastAsc].reverse());
  });

  it('sorts company and role columns case-insensitively', () => {
    const people = [
      contact({ id: 'a', company: 'zeta', role: 'b' }),
      contact({ id: 'b', company: 'Alpha', role: 'A' }),
    ];
    const ws2: Workspace = { ...emptyWorkspace(), contacts: people };
    const two = contactRollup(ws2, TODAY);
    expect(sortContacts(two, 'company', 'asc')[0]?.contact.id).toBe('b');
    expect(sortContacts(two, 'role', 'asc')[0]?.contact.id).toBe('b');
  });
});

describe('suggestContacts', () => {
  const people = [
    contact({ id: 'a', firstName: 'Dana', lastName: 'Reyes', company: 'Northwind' }),
    contact({ id: 'b', firstName: 'Daniel', lastName: 'Ash', company: 'Acme' }),
    contact({ id: 'c', firstName: 'Marcus', lastName: 'Danvers', company: 'Danco' }),
  ];

  it('ranks first-name prefixes above last-name and company matches', () => {
    expect(suggestContacts(people, 'dan').map((c) => c.id)).toEqual(['b', 'a', 'c']);
  });

  it('matches a full name and a leading @ the user typed', () => {
    expect(suggestContacts(people, '@dana r').map((c) => c.id)).toEqual(['a']);
  });

  it('falls back to substring matches, and excludes what is already linked', () => {
    expect(suggestContacts(people, 'eyes').map((c) => c.id)).toEqual(['a']);
    expect(suggestContacts(people, 'dan', ['b']).map((c) => c.id)).toEqual(['a', 'c']);
  });

  it('returns nothing for empty text and honours the limit', () => {
    expect(suggestContacts(people, '   ')).toEqual([]);
    expect(suggestContacts(people, 'dan', [], 2)).toHaveLength(2);
  });
});

describe('mentionCandidates', () => {
  const people = [
    contact({ id: 'a', firstName: 'Marcus', lastName: 'Bell' }),
    contact({ id: 'b', firstName: 'Dana', lastName: 'Reyes' }),
  ];

  it('lists everyone by display name for a bare @', () => {
    // Typing the sigil is itself the request to see who is available.
    expect(mentionCandidates(people, '').map((c) => c.id)).toEqual(['b', 'a']);
    expect(mentionCandidates(people, '', ['b']).map((c) => c.id)).toEqual(['a']);
    expect(mentionCandidates(people, '', [], 1)).toHaveLength(1);
  });

  it('narrows through suggestContacts once anything is typed', () => {
    expect(mentionCandidates(people, 'mar').map((c) => c.id)).toEqual(['a']);
  });
});

describe('findMention', () => {
  it('finds the token the caret sits in', () => {
    expect(findMention('Ask @dan', 8)).toEqual({ start: 4, end: 8, query: 'dan' });
    // The caret inside the word, not at its end.
    expect(findMention('Ask @danny about it', 7)).toEqual({ start: 4, end: 7, query: 'da' });
  });

  it('fires on a bare @ so the picker can open before anything is typed', () => {
    expect(findMention('@', 1)).toEqual({ start: 0, end: 1, query: '' });
    expect(findMention('Call @', 6)?.query).toBe('');
  });

  it('allows exactly one inner space, for disambiguating two Danas', () => {
    expect(findMention('Ask @dana r', 11)?.query).toBe('dana r');
    expect(findMention('Ask @dana r about', 17)).toBeNull();
  });

  it('refuses an @ that is not at a word boundary — an email is not a mention', () => {
    expect(findMention('mail dana@northwind.example', 27)).toBeNull();
    expect(findMention('(@dana', 6)?.query).toBe('dana');
  });

  it('gives up on prose and on punctuation inside the token', () => {
    expect(findMention(`@${'x'.repeat(40)}`, 41)).toBeNull();
    expect(findMention('Ask @dana, please', 17)).toBeNull();
    expect(findMention('no at sign here', 15)).toBeNull();
  });

  it('clamps a caret outside the text rather than reading past the end', () => {
    expect(findMention('@dana', 99)?.query).toBe('dana');
    expect(findMention('@dana', -3)).toBeNull();
  });
});

describe('completeMention', () => {
  const at = (text: string, caret: number, name: string) => {
    const m = findMention(text, caret);
    if (m === null) throw new Error('no mention');
    return completeMention(text, m, name);
  };

  it('completes the typed fragment to the full name, in place', () => {
    // The name stays in the title — the chip is the link, the text is how the
    // task reads to a human.
    expect(at('Ask @dana about the budget', 9, 'Dana Reyes')).toEqual({
      text: 'Ask @Dana Reyes about the budget',
      caret: 15,
    });
  });

  it('leaves the caret after the name, ready to keep typing', () => {
    const r = at('Ask @dana', 9, 'Dana Reyes');
    expect(r.text).toBe('Ask @Dana Reyes');
    expect(r.text.slice(r.caret)).toBe('');
  });

  it('completes a bare @ without disturbing what follows it', () => {
    expect(at('@ ships it', 1, 'Marcus Bell')).toEqual({
      text: '@Marcus Bell ships it',
      caret: 12,
    });
  });

  it('replaces only the mention, never the surrounding text', () => {
    expect(at('Email @dan re: Q3 and @x', 10, 'Daniel Ash').text).toBe(
      'Email @Daniel Ash re: Q3 and @x',
    );
  });
});

describe('maskMentions', () => {
  it('blanks the name but keeps every offset', () => {
    const text = 'Ask @Tom about it';
    const masked = maskMentions(text);
    expect(masked).toBe('Ask      about it');
    expect(masked).toHaveLength(text.length);
    // The unmasked half is untouched, character for character.
    expect(masked.slice(8)).toBe(text.slice(8));
  });

  it('stops a name being read as date vocabulary', () => {
    // "tom" is a D29 abbreviation for tomorrow; Tom Whitaker is not.
    expect(maskMentions('Ask @Tom Whitaker about the coat')).not.toMatch(/\btom\b/i);
    expect(maskMentions('Chase @Sat and @May')).not.toMatch(/\b(sat|may)\b/i);
  });

  it('leaves the sentence around it alone', () => {
    expect(maskMentions('call Bob tomorrow')).toBe('call Bob tomorrow');
    // An email address is not a mention, so its text stays readable.
    expect(maskMentions('mail dana@northwind.example')).toBe('mail dana@northwind.example');
    expect(maskMentions('')).toBe('');
  });

  it('masks only the first token, not the rest of the line', () => {
    expect(maskMentions('@Tom Whitaker friday')).toBe('     Whitaker friday');
  });
});

describe('searchContacts', () => {
  const people = [
    contact({ id: 'a', notes: 'prefers a call', tags: ['vendor'] }),
    contact({ id: 'b', firstName: 'Elena', lastName: 'Vasquez', company: 'Vasquez & Co' }),
  ];

  it('matches name, company, role, email, notes and tags', () => {
    expect(searchContacts(people, 'reyes').map((c) => c.id)).toEqual(['a']);
    expect(searchContacts(people, 'vasquez').map((c) => c.id)).toEqual(['b']);
    expect(searchContacts(people, 'platform').map((c) => c.id)).toEqual(['a', 'b']);
    expect(searchContacts(people, 'prefers a call').map((c) => c.id)).toEqual(['a']);
    expect(searchContacts(people, 'vendor').map((c) => c.id)).toEqual(['a']);
  });

  it('matches a phone number the way people remember it, without punctuation', () => {
    expect(searchContacts(people, '5552148890').map((c) => c.id)).toEqual(['a', 'b']);
    expect(searchContacts(people, '214-8890')).toHaveLength(2);
  });

  it('does not treat one or two digits as a phone search', () => {
    // "48" spans the dash in "214-8890", so it only matches once the number is
    // normalized — and two digits are too few to mean a phone lookup.
    expect(searchContacts(people, '48')).toEqual([]);
    expect(searchContacts(people, '148')).toHaveLength(2);
  });

  it('returns nothing for an empty query', () => {
    expect(searchContacts(people, '  ')).toEqual([]);
  });
});
