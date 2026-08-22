import type { Contact, IsoDate, Project, Task, Workspace } from '../types';
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
      // A stakeholder with no task of his own: the case that only a *direct*
      // project attachment can express, and the reason the Contacts card is a
      // union rather than a roll-up of the task links.
      contactIds: ['c7'],
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
      contactIds: ['c3'],
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
      contactIds: ['c4'],
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

  // Effort estimates (D36) on most of the work, deliberately not all of it:
  // the "unestimated" hint on the project header and the portfolio column
  // only renders when some open task has none.
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
    estimateHours: 12,
    contactIds: ['c1'],
    status: 'Done',
    priority: 'High',
    dueDate: d(-16),
    completedAt: d(-14),
  });
  const b = mk('p1', {
    title: 'Provision new k8s cluster',
    estimateHours: 24,
    contactIds: ['c1', 'c2'],
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
    estimateHours: 16,
    contactIds: ['c1'],
    status: 'Todo',
    priority: 'Critical',
    dueDate: d(-1),
    dependsOn: [b],
    // The headline case for the deferred report (D23): Critical work that has
    // slipped four times and is overdue anyway. Drives `chronicOverdue`.
    deferrals: [
      { from: d(-25), to: d(-18), on: d(-26) },
      { from: d(-18), to: d(-12), on: d(-19) },
      { from: d(-12), to: d(-6), on: d(-13) },
      { from: d(-6), to: d(-1), on: d(-7) },
    ],
  });
  const e = mk('p1', {
    title: 'Migrate billing service',
    estimateHours: 16,
    status: 'Todo',
    priority: 'High',
    dueDate: d(9),
    dependsOn: [b],
  });
  mk('p1', {
    title: 'Cutover & DNS switch',
    estimateHours: 6,
    contactIds: ['c2', 'c8'],
    status: 'Waiting',
    priority: 'Critical',
    dueDate: d(16),
    dependsOn: [c, e],
  });
  mk('p1', {
    title: 'Write migration runbook',
    estimateHours: 4,
    contactIds: ['c2'],
    status: 'Doing',
    priority: 'Medium',
    dueDate: d(0),
    links: [{ title: 'Runbook doc', url: 'https://example.com/runbook' }],
    // Below the default 3× threshold: present in the analytics totals but not
    // in the listed rows, so the report's "lower the threshold" hint is live.
    deferrals: [{ from: d(-4), to: d(0), on: d(-5) }],
  });

  const f = mk('p2', {
    title: 'User interviews (8 participants)',
    estimateHours: 20,
    contactIds: ['c3'],
    status: 'Done',
    priority: 'Medium',
    dueDate: d(-22),
    completedAt: d(-20),
  });
  const g = mk('p2', {
    title: 'Synthesize findings',
    estimateHours: 8,
    contactIds: ['c3'],
    status: 'Done',
    priority: 'Medium',
    dueDate: d(-11),
    completedAt: d(-9),
    dependsOn: [f],
    // Deferred three times and still shipped — drives `completedAnyway`, the
    // counterweight to chronicOverdue.
    deferrals: [
      { from: d(-20), to: d(-17), on: d(-21) },
      { from: d(-17), to: d(-14), on: d(-18) },
      { from: d(-14), to: d(-11), on: d(-15) },
    ],
  });
  const w = mk('p2', {
    title: 'New onboarding wireframes',
    estimateHours: 12,
    contactIds: ['c3'],
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
    estimateHours: 3,
    status: 'Done',
    priority: 'Medium',
    dueDate: d(-6),
    completedAt: d(-5),
  });
  const s2 = mk('p3', {
    title: 'Sand to 220 grit',
    estimateHours: 4,
    status: 'Doing',
    priority: 'Medium',
    dueDate: d(-2),
    dependsOn: [s1],
    deferrals: [
      { from: d(-9), to: d(-5), on: d(-10) },
      { from: d(-5), to: d(-2), on: d(-6) },
    ],
  });
  const s3 = mk('p3', {
    title: 'Apply first coat of spar varnish',
    estimateHours: 2,
    contactIds: ['c5'],
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
    estimateHours: 5,
    contactIds: ['c4'],
    status: 'Doing',
    priority: 'High',
    dueDate: d(-3),
    deferrals: [
      { from: d(-21), to: d(-14), on: d(-22) },
      { from: d(-14), to: d(-9), on: d(-15) },
      { from: d(-9), to: d(-3), on: d(-10) },
    ],
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
    contactIds: ['c4'],
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
    estimateHours: 10,
    contactIds: ['c6'],
    status: 'Doing',
    priority: 'Medium',
    dueDate: d(1),
    dependsOn: [j1],
  });
  const j3 = mk('p5', {
    title: 'Onsite loops (4)',
    contactIds: ['c6'],
    status: 'Todo',
    priority: 'High',
    dueDate: d(11),
    dependsOn: [j2],
  });
  mk('p5', {
    title: 'Make offer',
    contactIds: ['c6'],
    status: 'Waiting',
    priority: 'High',
    dueDate: d(18),
    dependsOn: [j3],
  });
  mk('p5', {
    title: 'Refine leveling rubric',
    status: 'Todo',
    priority: 'Low',
    dueDate: d(14),
    // Low-priority churn: the "this is fine" half of the by-priority breakdown.
    deferrals: [
      { from: d(-2), to: d(6), on: d(-3) },
      { from: d(6), to: d(14), on: d(5) },
    ],
  });
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

  /**
   * The sample address book (D31). Deliberately mixed: two people at the same
   * outside vendor, three colleagues with no company, two one-off
   * home-project contacts, one stakeholder attached to a project but to none
   * of its tasks, and a two-level reporting line (D32) — so the Contacts
   * card, the contacts screen's grouping, the org links, and the Contact
   * Activity report all render their interesting branches from the seed
   * rather than only from a workspace someone built by hand.
   */
  const contacts: Contact[] = [
    {
      id: 'c1',
      firstName: 'Dana',
      lastName: 'Reyes',
      company: 'Northwind Systems',
      department: 'Platform Engineering',
      role: 'Platform Lead',
      email: 'dana.reyes@northwind.example',
      phone: '(555) 214-8890',
      notes: 'Owns the k8s platform on their side. Prefers a short call over email threads.',
      tags: ['vendor'],
      createdAt: d(-40),
    },
    {
      id: 'c2',
      firstName: 'Marcus',
      lastName: 'Bell',
      company: '',
      department: 'Infrastructure',
      managerId: 'c8',
      role: 'SRE, on-call rotation',
      email: 'marcus.bell@example.com',
      phone: '(555) 771-3042',
      notes: 'Has to sign off on the DNS cutover window.',
      tags: ['team'],
      createdAt: d(-38),
    },
    {
      id: 'c3',
      firstName: 'Priya',
      lastName: 'Nair',
      company: '',
      department: 'Design',
      role: 'Product Designer',
      email: 'priya.nair@example.com',
      phone: '(555) 662-1177',
      notes: 'Ran the onboarding interviews; owns the wireframes.',
      tags: ['team', 'ux'],
      createdAt: d(-30),
    },
    {
      id: 'c4',
      firstName: 'Elena',
      lastName: 'Vasquez',
      company: 'Vasquez & Co CPA',
      department: '',
      role: 'Accountant',
      email: 'elena@vasquezcpa.example',
      phone: '(555) 903-4410',
      notes: 'Filed the extension. Wants everything as PDFs, not photos.',
      tags: ['finance'],
      createdAt: d(-15),
    },
    {
      id: 'c5',
      firstName: 'Tom',
      lastName: 'Whitaker',
      company: 'Harborline Marine',
      department: '',
      role: 'Shop Owner',
      email: 'tom@harborline.example',
      phone: '(555) 448-2201',
      notes: 'Sold the spar varnish; good for questions about coat timing.',
      tags: ['vendor'],
      createdAt: d(-20),
    },
    {
      id: 'c6',
      firstName: 'Sofia',
      lastName: 'Grant',
      company: '',
      department: 'Talent',
      managerId: 'c8',
      role: 'Recruiter',
      email: 'sofia.grant@example.com',
      phone: '(555) 330-9915',
      notes: 'Running the senior engineer pipeline. Sends the loop schedule Fridays.',
      tags: ['team', 'hiring'],
      createdAt: d(-45),
    },
    {
      id: 'c8',
      firstName: 'Rachel',
      lastName: 'Okonjo',
      company: '',
      department: 'Engineering',
      role: 'Director of Engineering',
      email: 'rachel.okonjo@example.com',
      phone: '(555) 118-7742',
      notes: 'Runs the platform and infrastructure teams. Approves the cutover window.',
      tags: ['team'],
      createdAt: d(-50),
    },
    {
      id: 'c7',
      firstName: 'Aidan',
      lastName: 'Cross',
      company: 'Northwind Systems',
      department: 'Commercial',
      role: 'Account Manager',
      email: 'aidan.cross@northwind.example',
      phone: '(555) 214-8801',
      notes: 'Commercial contact for the migration contract — no day-to-day tasks.',
      tags: ['vendor'],
      createdAt: d(-40),
    },
  ];

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

  return { projects, tasks, files, contacts, settings: { ...DEFAULT_SETTINGS } };
}
