import { isoAdd } from '@shared/domain/dates';
import { fmtShort } from '@shared/domain/dates';
import { allProjectTags, relativeDueLabel } from '@shared/domain/derive';
import type { ReportFilter, RiskRow, WeeklyBlock } from '@shared/domain/reports';
import {
  atRiskReport,
  atRiskText,
  portfolioRollup,
  portfolioText,
  retrospective,
  retrospectiveText,
  weeklyStatus,
  weeklyStatusText,
} from '@shared/domain/reports';
import type { Task, Workspace } from '@shared/types';
import { useState } from 'react';

import { useStore } from '../app/store';
import { CategoryPill, Dot, SegmentedControl } from '../components/primitives';
import { STATUS_COLORS } from '../styles/colors';

type ReportType = 'weekly' | 'portfolio' | 'retro' | 'risk';

const TYPE_OPTIONS = [
  ['weekly', 'Weekly status'],
  ['portfolio', 'Portfolio roll-up'],
  ['retro', 'Retrospective'],
  ['risk', 'At-risk'],
] as const;

function ReportLine({ task }: { task: Task }): React.JSX.Element {
  const { today, openTask } = useStore();
  const rel = relativeDueLabel(task.dueDate, today);
  return (
    <div
      className="report-line"
      role="button"
      tabIndex={0}
      onClick={() => {
        openTask(task.id);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') openTask(task.id);
      }}
    >
      <Dot color={STATUS_COLORS[task.status].dot} size={7} />
      <span className={`report-line-title ${task.status === 'Done' ? 'muted' : ''}`}>
        {task.title}
      </span>
      {task.dueDate !== null && (
        <span className="report-line-due" style={{ color: rel.color }}>
          {rel.text}
        </span>
      )}
    </div>
  );
}

function WeeklyReport({ blocks }: { blocks: WeeklyBlock[] }): React.JSX.Element {
  if (blocks.length === 0) {
    return <div className="report-block card-empty">No activity in this filter.</div>;
  }
  const col = (label: string, list: Task[], color: string, empty: string): React.JSX.Element => (
    <div className="weekly-col">
      <div className="weekly-col-label" style={{ color }}>
        {label}
      </div>
      {list.length > 0 ? (
        list.map((t) => <ReportLine key={t.id} task={t} />)
      ) : (
        <div className="weekly-empty">{empty}</div>
      )}
    </div>
  );
  return (
    <div className="report-stack">
      {blocks.map((b) => (
        <div key={b.project.id} className="report-block" data-testid={`weekly-${b.project.id}`}>
          <div className="report-project-head">
            <Dot color={b.project.color} size={10} />
            <span className="report-project-name">{b.project.name}</span>
            <CategoryPill category={b.project.category} />
          </div>
          <div className="weekly-cols">
            {col('DONE THIS WEEK', b.done, '#2f8552', '—')}
            {col('PLANNED NEXT', b.planned, '#4f5bd5', '—')}
            {col('BLOCKERS / AT RISK', b.blockers, '#c23b2b', 'None')}
          </div>
        </div>
      ))}
    </div>
  );
}

function PortfolioReport({
  workspace,
  filter,
}: {
  workspace: Workspace;
  filter: ReportFilter;
}): React.JSX.Element {
  const { today, openProject } = useStore();
  const rows = portfolioRollup(workspace, filter, today);
  return (
    <div className="report-block">
      <table className="portfolio-table" data-testid="portfolio-table">
        <thead>
          <tr>
            <th>PROJECT</th>
            <th>TYPE</th>
            <th className="num">OPEN</th>
            <th className="num">DONE</th>
            <th className="num">OVERDUE</th>
            <th>NEXT DUE</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr
              key={r.project.id}
              className="trow"
              onClick={() => {
                openProject(r.project.id);
              }}
            >
              <td>
                <span className="portfolio-name">
                  <Dot color={r.project.color} size={9} />
                  {r.project.name}
                </span>
              </td>
              <td>
                <CategoryPill category={r.project.category} />
              </td>
              <td className="num">{r.open}</td>
              <td className="num muted">{r.done}</td>
              <td className="num">
                {r.overdue > 0 ? <b className="overdue-count">{r.overdue}</b> : '0'}
              </td>
              <td>
                {r.next !== null ? (
                  <span
                    className="portfolio-next"
                    style={{ color: relativeDueLabel(r.next.dueDate, today).color }}
                  >
                    {relativeDueLabel(r.next.dueDate, today).text}
                  </span>
                ) : (
                  '—'
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RiskReport({ rows }: { rows: RiskRow[] }): React.JSX.Element {
  const { openTask } = useStore();
  if (rows.length === 0) {
    return (
      <div className="report-block risk-clear" data-testid="risk-clear">
        Nothing at risk in this filter. ✓
      </div>
    );
  }
  return (
    <div className="report-block">
      {rows.map(({ task, project, reason, color }) => (
        <div
          key={task.id}
          className="trow risk-row"
          role="button"
          tabIndex={0}
          onClick={() => {
            openTask(task.id);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') openTask(task.id);
          }}
        >
          <div className="trow-body">
            <div className="risk-title">{task.title}</div>
            <div className="trow-project">
              <Dot color={project.color} size={6} />
              {project.name}
            </div>
          </div>
          <span className="risk-reason" style={{ color }}>
            {reason}
          </span>
        </div>
      ))}
    </div>
  );
}

/** The reports surface (prototype viewReports). */
export function Reports(): React.JSX.Element {
  const { workspace, today, showToast } = useStore();
  const [type, setType] = useState<ReportType>('weekly');
  const [filter, setFilter] = useState<ReportFilter>('all');
  const [from, setFrom] = useState(isoAdd(today, -30));
  const [to, setTo] = useState(today);

  if (workspace === null) return <div className="stub-view">Loading…</div>;

  const tags = allProjectTags(workspace.projects);

  const copy = (): void => {
    let text: string;
    if (type === 'weekly') text = weeklyStatusText(weeklyStatus(workspace, filter, today), today);
    else if (type === 'portfolio')
      text = portfolioText(portfolioRollup(workspace, filter, today), today);
    else if (type === 'retro')
      text = retrospectiveText(retrospective(workspace, filter, from, to), from, to);
    else text = atRiskText(atRiskReport(workspace, filter, today), today);

    navigator.clipboard.writeText(text).then(
      () => {
        showToast('Report copied to clipboard');
      },
      () => {
        showToast('Copy failed — check permissions');
      },
    );
  };

  let body: React.JSX.Element;
  if (type === 'weekly') body = <WeeklyReport blocks={weeklyStatus(workspace, filter, today)} />;
  else if (type === 'portfolio') body = <PortfolioReport workspace={workspace} filter={filter} />;
  else if (type === 'retro') {
    const result = retrospective(workspace, filter, from, to);
    body = (
      <div className="report-stack">
        <div className="report-block retro-headline" data-testid="retro-headline">
          <span className="retro-count">{result.total}</span>
          <span className="retro-range">
            tasks completed · {fmtShort(from)} – {fmtShort(to)}
          </span>
        </div>
        {result.groups.length > 0 ? (
          result.groups.map((g) => (
            <div key={g.project.id} className="report-block">
              <div className="report-project-head">
                <Dot color={g.project.color} size={10} />
                <span className="report-project-name">{g.project.name}</span>
                <span className="card-count">{g.tasks.length}</span>
              </div>
              {g.tasks.map((t) => (
                <div key={t.id} className="report-line retro-line">
                  <Dot color="#3a9a5f" size={7} />
                  <span className="report-line-title">{t.title}</span>
                  <span className="retro-date">{fmtShort(t.completedAt)}</span>
                </div>
              ))}
            </div>
          ))
        ) : (
          <div className="report-block card-empty">No tasks completed in this range.</div>
        )}
      </div>
    );
  } else body = <RiskReport rows={atRiskReport(workspace, filter, today)} />;

  return (
    <div className="view-wrap fadein" style={{ maxWidth: 900 }}>
      <div className="report-controls">
        <SegmentedControl value={type} options={TYPE_OPTIONS} onChange={setType} />
        <div className="spacer" />
        {type === 'retro' && (
          <div className="retro-range-inputs">
            <input
              type="date"
              className="inp"
              value={from}
              aria-label="From date"
              onChange={(e) => {
                setFrom(e.target.value);
              }}
            />
            <span className="range-arrow">→</span>
            <input
              type="date"
              className="inp"
              value={to}
              aria-label="To date"
              onChange={(e) => {
                setTo(e.target.value);
              }}
            />
          </div>
        )}
        <select
          className="inp select"
          value={filter}
          aria-label="Report scope"
          onChange={(e) => {
            setFilter(e.target.value as ReportFilter);
          }}
        >
          <option value="all">All projects</option>
          <option value="work">Work only</option>
          <option value="home">Home only</option>
          {tags.map((t) => (
            <option key={t} value={`tag:${t}`}>
              #{t}
            </option>
          ))}
        </select>
        <button className="btn ghost" onClick={copy}>
          Copy report
        </button>
      </div>
      {body}
    </div>
  );
}
