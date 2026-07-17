import { fmtShort } from '@shared/domain/dates';
import {
  indexTasks,
  isBlocked,
  isDueThisWeek,
  isDueToday,
  isDueWithinWeek,
  isHighLater,
  isOpen,
  isOverdue,
  projectsInScope,
  tasksInScope,
} from '@shared/domain/derive';
import { byDue } from '@shared/domain/sort';
import type { Task } from '@shared/types';

import { useStore } from '../app/store';
import { SegmentedControl, StatCard } from '../components/primitives';
import { ProjectCard } from '../components/ProjectCard';
import { TaskRow } from '../components/TaskRow';

const SCOPE_OPTIONS = [
  ['all', 'All'],
  ['work', 'Work'],
  ['home', 'Home'],
] as const;

function FocusSection({
  title,
  tasks,
  accent,
}: {
  title: string;
  tasks: Task[];
  accent: string;
}): React.JSX.Element | null {
  if (tasks.length === 0) return null;
  return (
    <div className="card" data-testid={`focus-${title.toLowerCase().replace(/[^a-z]+/g, '-')}`}>
      <div className="focus-section-head">
        <span className="dot" style={{ width: 7, height: 7, background: accent }} />
        <span className="title">{title}</span>
        <span className="count">{tasks.length}</span>
      </div>
      <div className="focus-section-body">
        {tasks.map((t) => (
          <TaskRow key={t.id} task={t} showProject />
        ))}
      </div>
    </div>
  );
}

/** The daily-review home view (prototype viewHome). */
export function CommandCenter(): React.JSX.Element {
  const { workspace, today, scope, setScope, newProject } = useStore();
  const projects = workspace?.projects ?? [];
  const allTasks = workspace?.tasks ?? [];

  const scopedProjects = projectsInScope(projects, scope);
  const scoped = tasksInScope(allTasks, projects, scope);
  const open = scoped.filter(isOpen);
  const byId = indexTasks(allTasks);

  const overdue = open.filter((t) => isOverdue(t, today)).sort(byDue);
  const dueToday = open.filter((t) => isDueToday(t, today)).sort(byDue);
  const blocked = open.filter((t) => isBlocked(t, byId));
  const soon = open.filter((t) => isDueThisWeek(t, today)).sort(byDue);
  const urgentLater = open.filter((t) => isHighLater(t, today)).sort(byDue);
  const dueWeekCount = open.filter((t) => isDueWithinWeek(t, today)).length;
  const need = overdue.length + dueToday.length;
  const showBanner =
    overdue.length > 0 || dueToday.some((t) => t.priority === 'Critical' || t.priority === 'High');

  const sections = [
    { key: 'overdue', title: 'Overdue', tasks: overdue, accent: '#d94c3a' },
    { key: 'today', title: 'Due today', tasks: dueToday, accent: '#c23b2b' },
    { key: 'week', title: 'Due this week', tasks: soon, accent: '#4f5bd5' },
    { key: 'later', title: 'High priority · later', tasks: urgentLater, accent: '#a8710f' },
    { key: 'blocked', title: 'Blocked', tasks: blocked, accent: '#d69220' },
  ].filter((s) => s.tasks.length > 0);

  return (
    <div className="view-wrap fadein">
      <div className="home-header">
        <div className="headline">
          <div className="eyebrow">DAILY REVIEW · {fmtShort(today).toUpperCase()}</div>
          <h1 className="hero-title" data-testid="home-headline">
            {need > 0
              ? `${need} task${need > 1 ? 's' : ''} need your attention today`
              : 'Nothing urgent today — nice work.'}
          </h1>
        </div>
        <SegmentedControl value={scope} options={SCOPE_OPTIONS} onChange={setScope} />
      </div>

      <div className="stat-row">
        <StatCard label="Open tasks" value={open.length} />
        <StatCard label="Due this week" value={dueWeekCount} color="#4f5bd5" />
        <StatCard
          label="Overdue"
          value={overdue.length}
          color={overdue.length > 0 ? '#d94c3a' : undefined}
        />
        <StatCard label="Active projects" value={scopedProjects.length} />
      </div>

      {showBanner && (
        <div className="ambient-banner" data-testid="ambient-banner">
          <span className="dot" style={{ width: 8, height: 8, background: '#d94c3a' }} />
          <span className="banner-text">
            {overdue.length > 0 && `${overdue.length} task${overdue.length > 1 ? 's' : ''} overdue`}
            {overdue.length > 0 && dueToday.length > 0 && ' · '}
            {dueToday.length > 0 && `${dueToday.length} due today`}
          </span>
          <span className="banner-hint">Clear these first.</span>
        </div>
      )}

      <div className="home-grid">
        <div className="focus-col">
          {sections.length > 0 ? (
            sections.map((s) => (
              <FocusSection key={s.key} title={s.title} tasks={s.tasks} accent={s.accent} />
            ))
          ) : (
            <div className="all-clear">You are all caught up. 🎉</div>
          )}
        </div>
        <div className="portfolio-col">
          <div className="portfolio-head">
            <span className="title">Portfolio</span>
            <span className="count">{scopedProjects.length}</span>
            <div className="spacer" />
            <button
              className="btn ghost"
              style={{ fontSize: 12, padding: '5px 10px' }}
              onClick={newProject}
            >
              + Project
            </button>
          </div>
          {scopedProjects.map((p) => (
            <ProjectCard key={p.id} project={p} />
          ))}
        </div>
      </div>
    </div>
  );
}
