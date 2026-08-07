import { isArchived, relativeDueLabel } from '@shared/domain/derive';
import {
  PORTFOLIO_COLUMNS,
  portfolioProgress,
  portfolioRollup,
  sortPortfolio,
} from '@shared/domain/reports';
import type { PortfolioSortKey, SortDirection } from '@shared/domain/reports';
import { useState } from 'react';

import { useStore } from '../app/store';
import { CategoryPill, Dot } from '../components/primitives';

/** Columns whose first click should sort high-to-low. */
const NUMERIC_COLUMNS = new Set<PortfolioSortKey>(['progress', 'open', 'done', 'overdue']);

/**
 * The full project inventory — everything the sidebar lists, with the numbers
 * the sidebar has no room for.
 *
 * Deliberately built on portfolioRollup and sortPortfolio rather than its own
 * aggregation, so this screen and the portfolio report can never disagree
 * about how many tasks a project has open.
 *
 * Archived projects are off by default (D13) and reachable through an explicit
 * toggle: this is an inventory, so "where did that project go" has to have an
 * answer, but archived work still stays out of the default view.
 */
export function Projects(): React.JSX.Element {
  const { workspace, today, openProject } = useStore();
  const [sort, setSort] = useState<{ key: PortfolioSortKey; dir: SortDirection }>({
    key: 'project',
    dir: 'asc',
  });
  const [showArchived, setShowArchived] = useState(false);

  if (workspace === null) return <div className="stub-view">Loading…</div>;

  const rows = sortPortfolio(
    portfolioRollup(workspace, 'all', today, { includeArchived: showArchived }),
    sort.key,
    sort.dir,
  );
  const archivedCount = workspace.projects.filter(isArchived).length;

  const toggle = (key: PortfolioSortKey): void => {
    setSort((prev) =>
      prev.key === key
        ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
        : { key, dir: NUMERIC_COLUMNS.has(key) ? 'desc' : 'asc' },
    );
  };

  const totalOpen = rows.reduce((n, r) => n + r.open, 0);
  const totalOverdue = rows.reduce((n, r) => n + r.overdue, 0);

  return (
    <div className="view-wrap fadein">
      <div className="projects-head">
        <div>
          <div className="eyebrow">ALL PROJECTS</div>
          <h1 className="projects-headline" data-testid="projects-headline">
            {rows.length} project{rows.length === 1 ? '' : 's'} · {totalOpen} open task
            {totalOpen === 1 ? '' : 's'}
            {totalOverdue > 0 && (
              <span className="overdue-count">{` · ${String(totalOverdue)} overdue`}</span>
            )}
          </h1>
        </div>
        <div className="spacer" />
        {/* No "New project" button here: the top bar's is always on screen. */}
        {archivedCount > 0 && (
          <label className="projects-archived-toggle">
            <input
              type="checkbox"
              checked={showArchived}
              onChange={(e) => {
                setShowArchived(e.target.checked);
              }}
            />
            Show archived ({archivedCount})
          </label>
        )}
      </div>

      {rows.length === 0 ? (
        <div className="card-empty" data-testid="projects-empty">
          No projects yet. Create one to start tracking work.
        </div>
      ) : (
        <div className="card projects-card">
          <table className="portfolio-table projects-table" data-testid="projects-table">
            <thead>
              <tr>
                {PORTFOLIO_COLUMNS.map(([key, label]) => {
                  const active = sort.key === key;
                  return (
                    <th
                      key={key}
                      className={NUMERIC_COLUMNS.has(key) ? 'num' : undefined}
                      aria-sort={
                        active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'
                      }
                    >
                      <button
                        className={`sort-header ${active ? 'active' : ''}`}
                        title={`Sort by ${label.toLowerCase()}`}
                        onClick={() => {
                          toggle(key);
                        }}
                      >
                        {label.toUpperCase()}
                        <span className="sort-caret" aria-hidden="true">
                          {active ? (sort.dir === 'asc' ? '▲' : '▼') : ''}
                        </span>
                      </button>
                    </th>
                  );
                })}
                {/* Tags are shown, not sorted: a project's tag set has no
                    meaningful order to sort a whole table by. */}
                <th>TAGS</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const archived = isArchived(r.project);
                const pct = Math.round(portfolioProgress(r) * 100);
                return (
                  <tr
                    key={r.project.id}
                    className={`portfolio-row ${archived ? 'archived' : ''}`}
                    data-testid={`projects-row-${r.project.id}`}
                    onClick={() => {
                      openProject(r.project.id);
                    }}
                  >
                    <td>
                      <span className="portfolio-name">
                        <Dot color={r.project.color} size={9} />
                        {r.project.name}
                        {archived && <span className="archived-tag">Archived</span>}
                      </span>
                    </td>
                    <td>
                      <CategoryPill category={r.project.category} />
                    </td>
                    <td>
                      <div
                        className="portfolio-progress"
                        title={`${r.done} of ${r.open + r.done} tasks done (${pct}%)`}
                      >
                        <div className="progress-track">
                          <div
                            className="progress-fill"
                            style={{ width: `${pct}%`, background: r.project.color }}
                          />
                        </div>
                        <span className="portfolio-pct">{pct}%</span>
                      </div>
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
                    <td>
                      {r.project.tags.length === 0 ? (
                        <span className="muted">—</span>
                      ) : (
                        <span className="projects-tags">
                          {r.project.tags.map((t) => (
                            <span key={t} className="tag-chip small">
                              #{t}
                            </span>
                          ))}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
