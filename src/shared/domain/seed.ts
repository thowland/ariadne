import type { IsoDate, Project, Task, Workspace } from '../types';
import { DEFAULT_SETTINGS, PROJECT_PALETTE } from '../types';

import { isoAdd } from './dates';

/**
 * The sample dataset, ported verbatim from the prototype's seed() and shifted
 * relative to the provided `today`. Deterministic (fixed ids) so tests and
 * the E2E suite can assert against it.
 */
export function seedWorkspace(today: IsoDate): Workspace {
  const d = (n: number): IsoDate => isoAdd(today, n);
  const PAL = PROJECT_PALETTE;

  const projects: Project[] = [
    {
      id: 'p1',
      name: 'Q3 Platform Migration',
      category: 'work',
      tags: ['infra', 'q3'],
      color: PAL[0],
      status: 'Active',
      notes:
        'Migrating core services off the legacy monolith onto the new k8s platform before end of Q3. Zero-downtime cutover is the hard requirement — coordinate the DNS switch with the on-call rotation.',
      links: [
        { title: 'Migration RFC', url: 'https://example.com/rfc' },
        { title: 'Runbook (draft)', url: 'https://example.com/runbook' },
      ],
      createdAt: d(-40),
    },
    {
      id: 'p2',
      name: 'Customer Onboarding Revamp',
      category: 'work',
      tags: ['product', 'ux'],
      color: PAL[4],
      status: 'Active',
      notes:
        'Reduce time-to-first-value in onboarding. Research done; now designing the new flow and scoping eng.',
      links: [{ title: 'Research readout', url: 'https://example.com/research' }],
      createdAt: d(-30),
    },
    {
      id: 'p3',
      name: 'Refinish boat table',
      category: 'home',
      tags: ['woodworking'],
      color: PAL[2],
      status: 'Active',
      notes:
        'Teak table off the boat — strip, sand, and re-varnish with marine spar varnish. Three coats with a light sand between each.',
      links: [{ title: 'Varnish product', url: 'https://example.com/varnish' }],
      createdAt: d(-20),
    },
    {
      id: 'p4',
      name: '2025 Taxes',
      category: 'home',
      tags: ['finance'],
      color: PAL[3],
      status: 'Active',
      notes:
        'Pull together everything for the accountant. Extension is filed; final docs due soon.',
      links: [],
      createdAt: d(-15),
    },
    {
      id: 'p5',
      name: 'Hiring: Senior Engineer',
      category: 'work',
      tags: ['hiring'],
      color: PAL[1],
      status: 'Active',
      notes: 'Backfill for the platform team. In active screening; targeting an offer this month.',
      links: [{ title: 'Job post', url: 'https://example.com/job' }],
      createdAt: d(-45),
    },
    {
      id: 'p6',
      name: 'Home network upgrade',
      category: 'home',
      tags: ['tech'],
      color: PAL[5],
      status: 'Active',
      notes: 'Mesh wifi + wired backhaul to the office. Router arrived.',
      links: [],
      createdAt: d(-10),
    },
  ];

  const tasks: Task[] = [];
  let n = 0;
  const mk = (projectId: string, o: Partial<Task>): string => {
    n += 1;
    const id = `t${n}`;
    tasks.push({
      id,
      projectId,
      title: '',
      status: 'Todo',
      priority: 'Medium',
      tags: [],
      notes: '',
      dueDate: null,
      dependsOn: [],
      subtasks: [],
      links: [],
      createdAt: d(-30),
      completedAt: null,
      ...o,
    });
    return id;
  };

  const a = mk('p1', {
    title: 'Audit legacy service dependencies',
    status: 'Done',
    priority: 'High',
    dueDate: d(-16),
    completedAt: d(-14),
  });
  const b = mk('p1', {
    title: 'Provision new k8s cluster',
    status: 'Doing',
    priority: 'High',
    dueDate: d(2),
    dependsOn: [a],
    subtasks: [
      { title: 'Terraform modules', done: true },
      { title: 'Network policies', done: false },
      { title: 'Observability stack', done: false },
    ],
  });
  const c = mk('p1', {
    title: 'Migrate auth service',
    status: 'Todo',
    priority: 'Critical',
    dueDate: d(-1),
    dependsOn: [b],
  });
  const e = mk('p1', {
    title: 'Migrate billing service',
    status: 'Todo',
    priority: 'High',
    dueDate: d(9),
    dependsOn: [b],
  });
  mk('p1', {
    title: 'Cutover & DNS switch',
    status: 'Waiting',
    priority: 'Critical',
    dueDate: d(16),
    dependsOn: [c, e],
  });
  mk('p1', {
    title: 'Write migration runbook',
    status: 'Doing',
    priority: 'Medium',
    dueDate: d(0),
    links: [{ title: 'Runbook doc', url: 'https://example.com/runbook' }],
  });

  const f = mk('p2', {
    title: 'User interviews (8 participants)',
    status: 'Done',
    priority: 'Medium',
    dueDate: d(-22),
    completedAt: d(-20),
  });
  const g = mk('p2', {
    title: 'Synthesize findings',
    status: 'Done',
    priority: 'Medium',
    dueDate: d(-11),
    completedAt: d(-9),
    dependsOn: [f],
  });
  const w = mk('p2', {
    title: 'New onboarding wireframes',
    status: 'Doing',
    priority: 'High',
    dueDate: d(0),
    dependsOn: [g],
  });
  mk('p2', {
    title: 'Prototype in Figma',
    status: 'Todo',
    priority: 'Medium',
    dueDate: d(5),
    dependsOn: [w],
  });
  mk('p2', {
    title: 'Eng scoping & estimates',
    status: 'Waiting',
    priority: 'Medium',
    dueDate: d(7),
  });
  mk('p2', { title: 'Draft A/B test plan', status: 'Todo', priority: 'Low', dueDate: d(12) });

  const s1 = mk('p3', {
    title: 'Strip old varnish',
    status: 'Done',
    priority: 'Medium',
    dueDate: d(-6),
    completedAt: d(-5),
  });
  const s2 = mk('p3', {
    title: 'Sand to 220 grit',
    status: 'Doing',
    priority: 'Medium',
    dueDate: d(-2),
    dependsOn: [s1],
  });
  const s3 = mk('p3', {
    title: 'Apply first coat of spar varnish',
    status: 'Todo',
    priority: 'Medium',
    dueDate: d(3),
    dependsOn: [s2],
  });
  const s4 = mk('p3', {
    title: 'Second coat + light sand',
    status: 'Todo',
    priority: 'Low',
    dueDate: d(6),
    dependsOn: [s3],
  });
  mk('p3', {
    title: 'Third coat & reattach to boat',
    status: 'Todo',
    priority: 'Low',
    dueDate: d(10),
    dependsOn: [s4],
  });

  const x1 = mk('p4', {
    title: 'Gather 1099s and receipts',
    status: 'Doing',
    priority: 'High',
    dueDate: d(-3),
  });
  const x2 = mk('p4', {
    title: 'Categorize expenses',
    status: 'Todo',
    priority: 'High',
    dueDate: d(1),
    dependsOn: [x1],
  });
  mk('p4', {
    title: 'Meet with accountant',
    status: 'Todo',
    priority: 'Critical',
    dueDate: d(4),
    dependsOn: [x2],
  });
  mk('p4', {
    title: 'Confirm extension deadline',
    status: 'Waiting',
    priority: 'Medium',
    dueDate: d(8),
  });

  const j1 = mk('p5', {
    title: 'Write job description',
    status: 'Done',
    priority: 'Medium',
    dueDate: d(-26),
    completedAt: d(-24),
  });
  const j2 = mk('p5', {
    title: 'Screen candidates (12)',
    status: 'Doing',
    priority: 'Medium',
    dueDate: d(1),
    dependsOn: [j1],
  });
  const j3 = mk('p5', {
    title: 'Onsite loops (4)',
    status: 'Todo',
    priority: 'High',
    dueDate: d(11),
    dependsOn: [j2],
  });
  mk('p5', {
    title: 'Make offer',
    status: 'Waiting',
    priority: 'High',
    dueDate: d(18),
    dependsOn: [j3],
  });
  mk('p5', { title: 'Refine leveling rubric', status: 'Todo', priority: 'Low', dueDate: d(14) });
  mk('p5', { title: 'Post to niche job boards', status: 'Dropped', priority: 'Low' });

  const r1 = mk('p6', {
    title: 'Buy mesh router',
    status: 'Done',
    priority: 'Low',
    dueDate: d(-8),
    completedAt: d(-8),
  });
  const r2 = mk('p6', {
    title: 'Run cat6 to office',
    status: 'Todo',
    priority: 'Medium',
    dueDate: d(2),
    dependsOn: [r1],
  });
  mk('p6', {
    title: 'Configure VLANs',
    status: 'Todo',
    priority: 'Low',
    dueDate: d(9),
    dependsOn: [r2],
  });

  const files: Workspace['files'] = [
    {
      id: 'fa',
      projectId: 'p1',
      taskId: null,
      name: 'Migration overview.md',
      ext: 'md',
      mime: 'text/markdown',
      kind: 'markdown',
      size: 0,
      createdAt: d(-20),
      content:
        '# Q3 Platform Migration\n\n## Goal\nMove core services to the new **k8s platform** with a zero-downtime cutover before end of Q3.\n\n## Sequence\n1. Provision cluster\n2. Migrate auth service\n3. Migrate billing service\n4. DNS cutover\n\n> Coordinate the DNS switch with the on-call rotation.\n\nSee the [runbook](https://example.com/runbook) for the step-by-step.',
    },
    {
      id: 'fb',
      projectId: 'p1',
      taskId: null,
      name: 'Rollback plan.md',
      ext: 'md',
      mime: 'text/markdown',
      kind: 'markdown',
      size: 0,
      createdAt: d(-14),
      content:
        '# Rollback plan\n\n- Keep the legacy stack warm for 72h\n- DNS TTL set to `60s`\n- Owner: **SRE on-call**\n\nIf error rate exceeds 2%, revert DNS immediately.',
    },
    {
      id: 'fc',
      projectId: 'p1',
      taskId: null,
      name: 'Architecture diagram',
      ext: 'pdf',
      mime: 'application/pdf',
      kind: 'ref',
      size: 0,
      note: 'Current + target topology — stored in Drive',
      createdAt: d(-18),
      content: '',
    },
    {
      id: 'fd',
      projectId: 'p2',
      taskId: null,
      name: 'Interview findings.md',
      ext: 'md',
      mime: 'text/markdown',
      kind: 'markdown',
      size: 0,
      createdAt: d(-19),
      content:
        '# Onboarding interviews\n\n8 participants. Top themes:\n\n1. Setup takes too long\n2. Unclear next step after signup\n3. Wants sample data to explore\n\n## Quote\n> The empty first screen was the biggest drop-off point.',
    },
    {
      id: 'fe',
      projectId: 'p3',
      taskId: null,
      name: 'Varnish product spec',
      ext: 'pdf',
      mime: 'application/pdf',
      kind: 'ref',
      size: 0,
      note: 'Manufacturer datasheet',
      createdAt: d(-15),
      content: '',
    },
  ];

  return { projects, tasks, files, settings: { ...DEFAULT_SETTINGS } };
}
