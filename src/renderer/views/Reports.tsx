import { isoAdd } from '@shared/domain/dates';
import { fmtShort } from '@shared/domain/dates';
import { allProjectTags, relativeDueLabel, taskDueLabel } from '@shared/domain/derive';
import type {
  DeferralResult,
  ReportFilter,
  RetroBucket,
  RetroPreset,
  RiskRow,
  WeeklyBlock,
} from '@shared/domain/reports';
import {
  atRiskReport,
  atRiskText,
  DEFER_THRESHOLD_DEFAULT,
  DEFER_THRESHOLDS,
  deferredReport,
  deferredText,
  portfolioRollup,
  portfolioText,
  RETRO_PRESETS,
  retroBuckets,
  retroPresetRange,
  retrospective,
  retrospectiveText,
  weeklyStatus,
  weeklyStatusText,
} from '@shared/domain/reports';
import type { IsoDate, Task, Workspace } from '@shared/types';
import { useState } from 'react';

import { useStore } from '../app/store';
import { CategoryPill, Dot, SegmentedControl } from '../components/primitives';
import { PRIORITY_COLORS, STATUS_COLORS } from '../styles/colors';

type ReportType = 'weekly' | 'portfolio' | 'retro' | 'risk' | 'deferred';

const TYPE_OPTIONS = [
  ['weekly', 'Weekly status'],
  ['portfolio', 'Portfolio roll-up'],
  ['retro', 'Retrospective'],
  ['risk', 'At-risk'],
  ['deferred', 'Deferred'],
] as const;

function ReportLine({ task }: { task: Task }): React.JSX.Element {
  const { today, openTask } = useStore();
  const rel = taskDueLabel(task, today);
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

/** Colored-dot count pill for report headers (identity via the dot, not text). */
function CountPill({ count, label, color }: { count: number; label: string; color: string }) {
  if (count === 0) return null;
  return (
    <span className="report-count-pill">
      <Dot color={color} size={7} />
      {count} {label}
    </span>
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
            <div className="spacer" />
            <CountPill count={b.done.length} label="done" color="#2f8552" />
            <CountPill count={b.planned.length} label="planned" color="#4f5bd5" />
            <CountPill count={b.atRisk.length} label="at risk" color="#c23b2b" />
          </div>
          <div className="weekly-cols">
            {col('DONE THIS WEEK', b.done, '#2f8552', '—')}
            {col('PLANNED NEXT', b.planned, '#4f5bd5', '—')}
            {col('AT RISK', b.atRisk, '#c23b2b', 'None')}
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
            <th>PROGRESS</th>
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
              className="portfolio-row"
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
              <td>
                {(() => {
                  const total = r.open + r.done;
                  const pct = total > 0 ? Math.round((r.done / total) * 100) : 0;
                  return (
                    <div
                      className="portfolio-progress"
                      title={`${r.done} of ${total} tasks done (${pct}%)`}
                    >
                      <div className="progress-track">
                        <div
                          className="progress-fill"
                          style={{ width: `${pct}%`, background: r.project.color }}
                        />
                      </div>
                      <span className="portfolio-pct">{pct}%</span>
                    </div>
                  );
                })()}
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

/**
 * Completions-over-time chart for the retrospective: one series, daily or
 * weekly buckets from the domain layer. Single hue (the app's "done" green),
 * 4px rounded data-ends on a square baseline, only the peak directly
 * labeled — per-bucket values ride the hover tooltip.
 */
function RetroChart({ buckets }: { buckets: RetroBucket[] }): React.JSX.Element | null {
  if (buckets.length < 2) return null;
  const max = Math.max(...buckets.map((b) => b.count));
  if (max === 0) return null;
  const peakIndex = buckets.findIndex((b) => b.count === max);
  const first = buckets[0];
  const last = buckets[buckets.length - 1];
  return (
    <div className="report-block retro-chart-block" data-testid="retro-chart">
      <div className="weekly-col-label" style={{ color: '#2f8552' }}>
        COMPLETIONS OVER TIME
      </div>
      <div className="retro-chart" role="img" aria-label="Completed tasks per period">
        {buckets.map((b, i) => (
          <div
            key={b.start}
            className="retro-chart-slot"
            title={`${b.label}: ${b.count} completed`}
          >
            {i === peakIndex && <span className="retro-chart-peak">{b.count}</span>}
            <div
              className={`retro-chart-bar ${b.count === 0 ? 'zero' : ''}`}
              style={{ height: `${(b.count / max) * 100}%` }}
            />
          </div>
        ))}
      </div>
      <div className="retro-chart-axis">
        <span>{first?.label}</span>
        <span>{last?.label}</span>
      </div>
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

/** One headline number in the deferred report's analytics strip. */
function Stat({
  value,
  label,
  tone,
}: {
  value: string | number;
  label: string;
  tone?: string;
}): React.JSX.Element {
  return (
    <div className="defer-stat">
      <div className="defer-stat-value" style={tone === undefined ? undefined : { color: tone }}>
        {value}
      </div>
      <div className="defer-stat-label">{label}</div>
    </div>
  );
}

/**
 * Repeatedly-deferred report (D23): the ranked list of tasks whose due date
 * keeps moving, plus the analytics that make the list actionable — what the
 * churn costs in days, which projects generate it, and whether the deferred
 * work is low-priority (fine) or Critical (not fine).
 */
function DeferredReport({
  result,
  today,
}: {
  result: DeferralResult;
  today: IsoDate;
}): React.JSX.Element {
  const { openTask, openProject } = useStore();
  const a = result.analytics;

  if (a.tasksEverDeferred === 0) {
    return (
      <div className="report-block risk-clear" data-testid="defer-clear">
        No task in this filter has ever had its due date pushed back. ✓
      </div>
    );
  }

  const worst = result.rows[0]?.count ?? 1;

  return (
    <div className="report-stack">
      <div className="report-block defer-stats" data-testid="defer-stats">
        <Stat value={a.tasksOverThreshold} label={`at ${result.threshold}+ reschedules`} />
        <Stat value={a.tasksEverDeferred} label="ever deferred" />
        <Stat value={a.totalDeferrals} label="reschedules total" />
        <Stat value={`${String(a.totalDaysSlipped)}d`} label="days pushed out" />
        <Stat value={a.avgDaysPerDeferral} label="avg days per push" />
        <Stat value={a.medianDeferrals} label="median per task" />
        <Stat
          value={a.chronicOverdue}
          label="still open & overdue"
          tone={a.chronicOverdue > 0 ? '#c23b2b' : undefined}
        />
        <Stat value={a.completedAnyway} label="eventually done" tone="#2f8552" />
      </div>

      {result.rows.length === 0 ? (
        <div className="report-block card-empty" data-testid="defer-empty">
          Nothing has been rescheduled {result.threshold} or more times. Lower the threshold to see
          the {a.tasksEverDeferred} task(s) that have slipped at least once.
        </div>
      ) : (
        <div className="report-block" data-testid="defer-rows">
          {result.rows.map((r) => (
            <div
              key={r.task.id}
              className="trow defer-row"
              role="button"
              tabIndex={0}
              onClick={() => {
                openTask(r.task.id);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') openTask(r.task.id);
              }}
            >
              <div className="defer-count" title={`${String(r.count)} reschedules`}>
                <span className="defer-count-num">{r.count}×</span>
                <div className="defer-bar-track">
                  <div
                    className="defer-bar-fill"
                    style={{
                      width: `${String((r.count / worst) * 100)}%`,
                      background: r.overdueNow ? '#c23b2b' : r.project.color,
                    }}
                  />
                </div>
              </div>
              <div className="trow-body">
                <div className={`risk-title ${r.task.status === 'Done' ? 'muted' : ''}`}>
                  {r.task.title || 'Untitled task'}
                </div>
                <div className="trow-project">
                  <Dot color={r.project.color} size={6} />
                  {r.project.name}
                  <span className="defer-trail">
                    first due {fmtShort(r.first.from)} → now {fmtShort(r.task.dueDate ?? r.last.to)}{' '}
                    · +{r.totalDays}d · last moved{' '}
                    {r.daysSinceLast === 0 ? 'today' : `${String(r.daysSinceLast)}d ago`}
                  </span>
                </div>
              </div>
              <span
                className="risk-reason"
                style={{
                  color: r.overdueNow ? '#c23b2b' : relativeDueLabel(r.task.dueDate, today).color,
                }}
              >
                {r.task.status === 'Done'
                  ? 'Completed'
                  : relativeDueLabel(r.task.dueDate, today).text}
              </span>
            </div>
          ))}
        </div>
      )}

      <div className="defer-breakdowns">
        <div className="report-block" data-testid="defer-by-project">
          <div className="weekly-col-label">WHERE THE CHURN IS</div>
          {a.byProject.map((p) => (
            <div
              key={p.project.id}
              className="report-line"
              role="button"
              tabIndex={0}
              onClick={() => {
                openProject(p.project.id);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') openProject(p.project.id);
              }}
            >
              <Dot color={p.project.color} size={7} />
              <span className="report-line-title">{p.project.name}</span>
              <span className="report-line-due muted">
                {p.deferrals}× · {p.tasks} task{p.tasks === 1 ? '' : 's'} · +{p.days}d
              </span>
            </div>
          ))}
        </div>
        <div className="report-block" data-testid="defer-by-priority">
          <div className="weekly-col-label">WHAT KEEPS SLIPPING</div>
          {a.byPriority.map((p) => (
            <div key={p.priority} className="report-line">
              <Dot color={PRIORITY_COLORS[p.priority].dot} size={7} />
              <span className="report-line-title">{p.priority}</span>
              <span className="report-line-due muted">{p.deferrals}×</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** The reports surface (prototype viewReports). */
export function Reports(): React.JSX.Element {
  const { workspace, today, showToast } = useStore();
  const [type, setType] = useState<ReportType>('weekly');
  const [filter, setFilter] = useState<ReportFilter>('all');
  const [preset, setPreset] = useState<RetroPreset>('last-30');
  const [from, setFrom] = useState(isoAdd(today, -30));
  const [to, setTo] = useState(today);
  const [deferMin, setDeferMin] = useState<number>(DEFER_THRESHOLD_DEFAULT);

  const pickPreset = (next: RetroPreset): void => {
    setPreset(next);
    if (next !== 'custom') {
      const range = retroPresetRange(next, today);
      setFrom(range.from);
      setTo(range.to);
    }
  };

  if (workspace === null) return <div className="stub-view">Loading…</div>;

  const tags = allProjectTags(workspace.projects);

  const copy = (): void => {
    let text: string;
    if (type === 'weekly') text = weeklyStatusText(weeklyStatus(workspace, filter, today), today);
    else if (type === 'portfolio')
      text = portfolioText(portfolioRollup(workspace, filter, today), today);
    else if (type === 'retro')
      text = retrospectiveText(retrospective(workspace, filter, from, to), from, to);
    else if (type === 'deferred')
      text = deferredText(deferredReport(workspace, filter, deferMin, today), today);
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
        <RetroChart buckets={retroBuckets(result, from, to)} />
        {result.groups.length > 0 ? (
          result.groups.map((g) => (
            <div key={g.project.id} className="report-block">
              <div className="report-project-head">
                <Dot color={g.project.color} size={10} />
                <span className="report-project-name">{g.project.name}</span>
                {g.project.archived === true && <span className="card-hint">archived</span>}
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
  } else if (type === 'deferred') {
    body = (
      <DeferredReport result={deferredReport(workspace, filter, deferMin, today)} today={today} />
    );
  } else body = <RiskReport rows={atRiskReport(workspace, filter, today)} />;

  return (
    <div className="view-wrap fadein" style={{ maxWidth: 900 }}>
      <div className="report-controls">
        <SegmentedControl value={type} options={TYPE_OPTIONS} onChange={setType} />
        <div className="spacer" />
        {type === 'retro' && (
          <div className="retro-range-inputs">
            <select
              className="inp select"
              value={preset}
              aria-label="Date range preset"
              onChange={(e) => {
                pickPreset(e.target.value as RetroPreset);
              }}
            >
              {RETRO_PRESETS.map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
            <input
              type="date"
              className="inp"
              value={from}
              aria-label="From date"
              onChange={(e) => {
                setPreset('custom');
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
                setPreset('custom');
                setTo(e.target.value);
              }}
            />
          </div>
        )}
        {type === 'deferred' && (
          <select
            className="inp select"
            value={deferMin}
            aria-label="Minimum reschedules"
            onChange={(e) => {
              setDeferMin(Number(e.target.value));
            }}
          >
            {DEFER_THRESHOLDS.map((n) => (
              <option key={n} value={n}>
                {n}+ reschedules
              </option>
            ))}
          </select>
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
