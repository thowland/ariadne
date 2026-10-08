import { describe, expect, it } from 'vitest';

import { parseQuickAddDraft } from './quick-add-schema';

const good = {
  projectId: 'p1',
  title: 'Call the vendor',
  dueDate: '2026-07-09',
  tags: ['infra'],
  people: [{ contactId: null, name: 'Nia Okafor' }],
};

describe('parseQuickAddDraft (D51)', () => {
  it('passes a well-formed draft through', () => {
    expect(parseQuickAddDraft(good)).toEqual(good);
    expect(parseQuickAddDraft({ ...good, dueDate: null })?.dueDate).toBeNull();
  });

  it('refuses anything malformed', () => {
    expect(parseQuickAddDraft(null)).toBeNull();
    expect(parseQuickAddDraft({ ...good, title: '   ' })).toBeNull();
    expect(parseQuickAddDraft({ ...good, projectId: '' })).toBeNull();
    expect(parseQuickAddDraft({ ...good, dueDate: '2026-02-30' })).toBeNull();
    expect(parseQuickAddDraft({ ...good, tags: 'infra' })).toBeNull();
    expect(parseQuickAddDraft({ ...good, people: [{ contactId: 3, name: 'x' }] })).toBeNull();
  });
});
