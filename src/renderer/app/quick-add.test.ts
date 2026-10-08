import { beforeEach, describe, expect, it } from 'vitest';

import { loadTestWorkspace, setupTestApp } from '../test-utils';

import { receiveQuickAdd } from './quick-add';
import { useStore } from './store';

beforeEach(() => {
  setupTestApp();
  loadTestWorkspace();
});

describe('receiveQuickAdd (D51)', () => {
  it('creates the flyout’s task in the main window and says where it went', () => {
    const before = useStore.getState().workspace!.tasks.length;
    receiveQuickAdd({
      projectId: 'p1',
      title: 'Call the vendor',
      dueDate: null,
      tags: ['infra'],
      people: [{ contactId: null, name: 'Nia Okafor' }],
    });
    const ws = useStore.getState().workspace!;
    expect(ws.tasks).toHaveLength(before + 1);
    const task = ws.tasks.at(-1)!;
    expect(task).toMatchObject({ projectId: 'p1', title: 'Call the vendor', tags: ['infra'] });
    expect(ws.contacts.find((c) => c.firstName === 'Nia')?.id).toBe(task.contactIds?.[0]);
    expect(useStore.getState().toast).toBe('Added “Call the vendor” to Q3 Platform Migration');
  });

  it('creates nothing when the project has gone, and says so', () => {
    const before = useStore.getState().workspace!.tasks.length;
    receiveQuickAdd({ projectId: 'ghost', title: 'Lost', dueDate: null, tags: [], people: [] });
    expect(useStore.getState().workspace!.tasks).toHaveLength(before);
    expect(useStore.getState().toast).toBe('Quick add: that project is no longer available');
  });
});
