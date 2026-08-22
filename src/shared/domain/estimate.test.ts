import { describe, expect, it } from 'vitest';

import type { Task } from '../types';

import { estimateTotals, formatEstimate, parseEstimate } from './estimate';

function task(patch: Partial<Task> = {}): Task {
  return {
    id: 't1',
    projectId: 'p1',
    title: 'Task',
    status: 'Todo',
    priority: 'Medium',
    tags: [],
    notes: '',
    dueDate: null,
    dependsOn: [],
    subtasks: [],
    links: [],
    createdAt: '2026-06-01',
    completedAt: null,
    ...patch,
  };
}

describe('parseEstimate', () => {
  it('reads days and hours, together or alone', () => {
    expect(parseEstimate('2d 4h')).toBe(20);
    expect(parseEstimate('2d')).toBe(16);
    expect(parseEstimate('4h')).toBe(4);
    expect(parseEstimate('1.5d')).toBe(12);
  });

  it('treats a bare number as hours, the unit people leave off', () => {
    expect(parseEstimate('6')).toBe(6);
    expect(parseEstimate('0.5')).toBe(0.5);
  });

  it('is forgiving about spacing and case', () => {
    expect(parseEstimate('  2D4H ')).toBe(20);
    expect(parseEstimate('2 d  4 h')).toBe(20);
  });

  it('accepts minutes, rounded to the nearest minute rather than to 2dp', () => {
    expect(parseEstimate('90m')).toBe(1.5);
    // 20 minutes is exactly a third of an hour and stays one.
    expect(parseEstimate('20m')).toBe(20 / 60);
    expect(parseEstimate('1m')).toBe(1 / 60);
  });

  it('an empty field means no estimate, not zero effort', () => {
    expect(parseEstimate('')).toBe(0);
    expect(parseEstimate('   ')).toBe(0);
  });

  it('refuses what it cannot read rather than guessing', () => {
    expect(parseEstimate('a while')).toBeNull();
    expect(parseEstimate('2d banana')).toBeNull();
    expect(parseEstimate('2x')).toBeNull();
    // Two of the same unit is ambiguous about which was meant.
    expect(parseEstimate('2d 3d')).toBeNull();
    // A typo that would poison every roll-up it lands in.
    expect(parseEstimate('999999d')).toBeNull();
  });
});

describe('formatEstimate', () => {
  it('renders hours back the way they were typed', () => {
    expect(formatEstimate(20)).toBe('2d 4h');
    expect(formatEstimate(16)).toBe('2d');
    expect(formatEstimate(4)).toBe('4h');
    expect(formatEstimate(1.5)).toBe('1.5h');
  });

  it('round-trips through the parser', () => {
    for (const text of ['2d 4h', '3d', '7h', '1.5h']) {
      expect(formatEstimate(parseEstimate(text) ?? 0)).toBe(text);
    }
  });

  it('is empty for nothing at all', () => {
    expect(formatEstimate(undefined)).toBe('');
    expect(formatEstimate(0)).toBe('');
  });
});

describe('estimateTotals', () => {
  it('separates effort still to do from effort estimated overall', () => {
    const totals = estimateTotals([
      task({ id: 'a', estimateHours: 8 }),
      task({ id: 'b', status: 'Done', completedAt: '2026-06-02', estimateHours: 4 }),
      task({ id: 'c', status: 'Doing', estimateHours: 2 }),
    ]);
    expect(totals).toEqual({ open: 10, total: 14, unestimated: 0 });
  });

  it('counts how much of the open work nobody has estimated', () => {
    const totals = estimateTotals([task({ id: 'a', estimateHours: 8 }), task({ id: 'b' })]);
    expect(totals).toMatchObject({ open: 8, unestimated: 1 });
  });

  it('leaves dropped work out of both figures', () => {
    // Giving up on something must not make a project look busier.
    const totals = estimateTotals([
      task({ id: 'a', estimateHours: 8 }),
      task({ id: 'b', status: 'Dropped', estimateHours: 40 }),
    ]);
    expect(totals).toEqual({ open: 8, total: 8, unestimated: 0 });
  });

  it('is all zeroes for nothing', () => {
    expect(estimateTotals([])).toEqual({ open: 0, total: 0, unestimated: 0 });
  });
});
