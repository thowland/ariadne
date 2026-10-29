import { describe, expect, it } from 'vitest';

import { convertMsProject, isMsProjectDocument, msDate, msPriority } from './msproject';

const TODAY = '2026-07-08';

/** The shape MPXJ's JsonWriter gives a small two-phase plan. */
const MPXJ = {
  property_values: { project_title: 'Lab Move', comments: 'Building 4' },
  tasks: [
    { unique_id: 0, id: 0, name: 'Lab Move', outline_level: 0, summary: true },
    {
      unique_id: 1,
      id: 1,
      name: 'Design Phase',
      outline_level: 1,
      summary: true,
      parent_task_unique_id: 0,
    },
    {
      unique_id: 2,
      id: 2,
      name: 'Floor plan',
      outline_level: 2,
      parent_task_unique_id: 1,
      start: '2026-03-02T08:00:00.0',
      finish: '2026-03-06T17:00:00.0',
      percent_complete: 100,
      actual_finish: '2026-03-05T17:00:00.0',
      priority: 700,
      notes: 'Ask facilities',
    },
    {
      unique_id: 3,
      id: 3,
      name: 'Sign-off',
      outline_level: 2,
      parent_task_unique_id: 1,
      milestone: true,
      finish: '2026-03-09T17:00:00.0',
      percent_complete: 0,
      predecessors: [{ predecessor_task_unique_id: 2, type: 'FS' }],
    },
    {
      unique_id: 4,
      id: 4,
      name: 'Build Phase',
      outline_level: 1,
      summary: true,
      parent_task_unique_id: 0,
    },
    {
      unique_id: 5,
      id: 5,
      name: 'Move benches',
      outline_level: 2,
      parent_task_unique_id: 4,
      finish: '2026-04-10T17:00:00.0',
      percent_complete: 40,
      priority: 950,
      predecessors: [{ predecessor_task_unique_id: 3 }, { predecessor_task_unique_id: 1 }],
    },
    { unique_id: 6, id: 6, name: '', outline_level: 1, parent_task_unique_id: 0 },
  ],
};

describe('isMsProjectDocument', () => {
  it('recognises an MS Project conversion', () => {
    expect(isMsProjectDocument(MPXJ)).toBe(true);
    expect(isMsProjectDocument({ Tasks: [{ UniqueID: 1, Name: 'x', Start: 'y' }] })).toBe(true);
  });

  it('leaves Ariadne’s own shapes alone', () => {
    expect(isMsProjectDocument({ name: 'P', tasks: [{ title: 'a', status: 'Todo' }] })).toBe(false);
    expect(isMsProjectDocument({ project: { name: 'P' }, tasks: [{ title: 'a' }] })).toBe(false);
    expect(isMsProjectDocument({ projects: [], tasks: [{ unique_id: 1 }] })).toBe(false);
    expect(isMsProjectDocument({ name: 'P', tasks: [] })).toBe(false);
    expect(isMsProjectDocument({ name: 'P' })).toBe(false);
  });
});

describe('convertMsProject', () => {
  const { doc, warnings } = convertMsProject(MPXJ, TODAY);
  const byTitle = (t: string): Record<string, unknown> => doc.tasks.find((x) => x.title === t)!;

  it('names the project from its properties', () => {
    expect(doc.project).toEqual({ name: 'Lab Move', notes: 'Building 4' });
  });

  it('keeps only real tasks; phases become tags', () => {
    expect(doc.tasks.map((t) => t.title)).toEqual(['Floor plan', 'Sign-off', 'Move benches']);
    expect(byTitle('Floor plan').tags).toEqual(['design-phase']);
    expect(byTitle('Sign-off').tags).toEqual(['design-phase', 'milestone']);
    expect(byTitle('Move benches').tags).toEqual(['build-phase']);
  });

  it('maps dates, progress and priority', () => {
    expect(byTitle('Floor plan')).toMatchObject({
      status: 'Done',
      dueDate: '2026-03-06',
      completedAt: '2026-03-05',
      priority: 'High',
      notes: 'Ask facilities',
    });
    expect(byTitle('Sign-off')).toMatchObject({
      status: 'Todo',
      completedAt: null,
      priority: 'Medium',
    });
    expect(byTitle('Move benches')).toMatchObject({ status: 'Doing', priority: 'Critical' });
  });

  it('turns predecessors into Blocked by, dropping links to phases', () => {
    expect(byTitle('Sign-off').dependsOn).toEqual(['2']);
    expect(byTitle('Move benches').dependsOn).toEqual(['3']);
    expect(warnings).toEqual([
      '2 summary tasks became tags',
      '1 blank row skipped',
      '1 link to a summary or missing task dropped',
    ]);
  });

  it('reads PascalCase fields, outline levels without parent ids, and text predecessors', () => {
    const out = convertMsProject(
      {
        Name: 'Fallback name',
        Tasks: [
          { ID: 1, UniqueID: 10, Name: 'Phase A', OutlineLevel: 1 },
          { ID: 2, UniqueID: 20, Name: 'One', OutlineLevel: 2, Finish: 'Mon 3/2/26 5:00 PM' },
          {
            ID: 3,
            UniqueID: 30,
            Name: 'Two',
            OutlineLevel: 2,
            Predecessors: '2FS+1d',
            PercentComplete: '50%',
          },
          { ID: 4, UniqueID: 40, Name: 'Solo', OutlineLevel: 1, Priority: 'LOW' },
        ],
      },
      TODAY,
    );
    expect(out.doc.project.name).toBe('Fallback name');
    expect(out.doc.tasks.map((t) => [t.title, t.tags])).toEqual([
      ['One', ['phase-a']],
      ['Two', ['phase-a']],
      ['Solo', []],
    ]);
    // "2FS+1d" names row 2, which is unique id 20.
    expect(out.doc.tasks[1]).toMatchObject({ dependsOn: ['20'], status: 'Doing' });
    expect(out.doc.tasks[0]).toMatchObject({ dueDate: '2026-03-02' });
    expect(out.doc.tasks[2]).toMatchObject({ priority: 'Low' });
    expect(out.warnings).toEqual(['1 summary task became tags']);
  });

  it('falls back to the project summary row, then a default name', () => {
    expect(
      convertMsProject({ tasks: [{ unique_id: 0, outline_level: 0, name: 'Root' }] }, TODAY).doc
        .project.name,
    ).toBe('Root');
    expect(convertMsProject({ tasks: [{ unique_id: 1, name: 'a' }] }, TODAY).doc.project.name).toBe(
      'Imported MS Project',
    );
  });

  it('dates a finished task with no dates today, and reads nested project.tasks', () => {
    const out = convertMsProject(
      { project: { name: 'Nested', tasks: [{ uid: 1, name: 'a', percent_complete: 100 }] } },
      TODAY,
    );
    expect(out.doc.project.name).toBe('Nested');
    expect(out.doc.tasks[0]).toMatchObject({ status: 'Done', completedAt: TODAY, dueDate: null });
  });
});

describe('msDate / msPriority', () => {
  it('reads the date part only', () => {
    expect(msDate('2026-03-02T08:00:00.0')).toBe('2026-03-02');
    expect(msDate('3/2/2026')).toBe('2026-03-02');
    expect(msDate('Mon 3/2/26 5:00 PM')).toBe('2026-03-02');
    expect(msDate('2026-02-30T00:00')).toBeNull();
    expect(msDate('soon')).toBeNull();
    expect(msDate(20260302)).toBeNull();
  });

  it('maps MS Project priorities', () => {
    expect([1000, 900, 800, 600, 500, 400, 300, 0].map(msPriority)).toEqual([
      'Critical',
      'Critical',
      'High',
      'High',
      'Medium',
      'Medium',
      'Low',
      'Low',
    ]);
    expect(['HIGHEST', 'VERY_HIGH', 'MEDIUM', 'VERY_LOW', undefined].map(msPriority)).toEqual([
      'Critical',
      'High',
      'Medium',
      'Low',
      'Medium',
    ]);
  });
});

describe('convertMsProject — edge cases', () => {
  it('reads predecessors in every shape converters write, once each', () => {
    const out = convertMsProject(
      {
        tasks: [
          { unique_id: 10, id: 1, name: 'A' },
          { unique_id: 20, id: 2, name: 'B' },
          { unique_id: 30, id: 3, name: 'C', predecessors: 10 },
          { unique_id: 40, id: 4, name: 'D', predecessors: [{ id: 20 }, { unique_id: 20 }, '10'] },
          { unique_id: 50, id: 5, name: 'E', predecessors: '1FS;2SS+1d' },
          {
            unique_id: 60,
            id: 6,
            name: 'F',
            predecessors: [{ unique_id: 60 }, { note: 'x' }, 'junk'],
          },
        ],
      },
      TODAY,
    );
    const deps = Object.fromEntries(
      out.doc.tasks.map((t): [string, unknown] => [t.title as string, t.dependsOn]),
    );
    expect(deps).toEqual({
      A: [],
      B: [],
      C: ['10'],
      // Object ids are unique ids; "10" in a list is not a row number.
      D: ['20', '10'],
      // Text like Project's own column counts rows: rows 1 and 2.
      E: ['10', '20'],
      // A task cannot block itself.
      F: [],
    });
    expect(out.warnings).toEqual(['1 link to a summary or missing task dropped']);
  });

  it('survives a parent loop instead of hanging', () => {
    const out = convertMsProject(
      {
        tasks: [
          { unique_id: 1, name: 'Loop A', parent_task_unique_id: 2, summary: true },
          { unique_id: 2, name: 'Loop B', parent_task_unique_id: 1, summary: true },
          { unique_id: 3, name: 'Leaf', parent_task_unique_id: 1 },
        ],
      },
      TODAY,
    );
    expect(out.doc.tasks.map((t) => [t.title, t.tags])).toEqual([['Leaf', ['loop-b', 'loop-a']]]);
  });

  it('keeps created dates, project notes, and skips rows that are not objects', () => {
    const out = convertMsProject(
      {
        project_properties: { name: 'Plan', comments: 'From PMO' },
        tasks: ['junk', null, { unique_id: 1, name: 'a', created: '2026-01-02T09:00:00' }],
      },
      TODAY,
    );
    expect(out.doc.project).toEqual({ name: 'Plan', notes: 'From PMO' });
    expect(out.doc.tasks).toHaveLength(1);
    expect(out.doc.tasks[0]).toMatchObject({ createdAt: '2026-01-02' });
  });

  it('marks a task with only an actual start as Doing, and reads the finish as due', () => {
    const [task] = convertMsProject(
      { tasks: [{ uid: 1, name: 'a', actual_start: '2026-03-01', finish: '3/9/2026' }] },
      TODAY,
    ).doc.tasks;
    expect(task).toMatchObject({ status: 'Doing', dueDate: '2026-03-09', completedAt: null });
  });
});

describe('isMsProjectDocument — edge cases', () => {
  it('ignores rows that are not objects and tasks with only Ariadne fields', () => {
    expect(isMsProjectDocument({ tasks: ['x', 1, { name: 'a', notes: '' }] })).toBe(false);
    expect(isMsProjectDocument({ tasks: [null, { Name: 'a', Finish: '2026-01-01' }] })).toBe(true);
  });
});
