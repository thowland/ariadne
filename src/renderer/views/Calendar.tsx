import {
  monthCells,
  monthTitle,
  shiftMonth,
  shiftWeek,
  tasksByDueDate,
  upcomingTasks,
  weekCells,
  weekTitle,
} from '@shared/domain/calendar';
import { dayOfWeek, monthKey } from '@shared/domain/dates';
import { tasksInScope } from '@shared/domain/derive';

import { useStore } from '../app/store';
import { Card, Dot, SegmentedControl } from '../components/primitives';
import { TaskRow } from '../components/TaskRow';
import { PRIORITY_COLORS } from '../styles/colors';

const DOW = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

const SCOPE_OPTIONS = [
  ['all', 'All'],
  ['work', 'Work'],
  ['home', 'Home'],
] as const;

const MODE_OPTIONS = [
  ['month', 'Month'],
  ['week', 'Week'],
] as const;

/** Month/week grids + upcoming list (prototype viewCalendar). */
/** Chips shown per fixed-height month cell before truncating to "+N more". */
const MAX_CHIPS = 3;
/** The roomier week columns fit more before truncating. */
const MAX_WEEK_CHIPS = 8;

export function Calendar(): React.JSX.Element {
  const {
    workspace,
    today,
    scope,
    setScope,
    calMonth,
    setCalMonth,
    calMode,
    setCalMode,
    calWeek,
    setCalWeek,
    openTask,
    openDay,
  } = useStore();
  const month = calMonth ?? monthKey(today);
  const week = calWeek ?? today;

  const scoped = tasksInScope(workspace?.tasks ?? [], workspace?.projects ?? [], scope);
  const byDate = tasksByDueDate(scoped);
  const upcoming = upcomingTasks(scoped, today);
  const cells = monthCells(month);

  const shift = (delta: number): void => {
    if (calMode === 'month') setCalMonth(shiftMonth(month, delta));
    else setCalWeek(shiftWeek(week, delta));
  };

  return (
    <div className="view-wrap fadein" style={{ maxWidth: 1180 }}>
      <div className="cal-header">
        <h1 className="cal-title">{calMode === 'month' ? monthTitle(month) : weekTitle(week)}</h1>
        <button
          className="btn ghost cal-nav"
          aria-label={calMode === 'month' ? 'Previous month' : 'Previous week'}
          onClick={() => {
            shift(-1);
          }}
        >
          ‹
        </button>
        <button
          className="btn ghost"
          onClick={() => {
            setCalMonth(null);
            setCalWeek(null);
          }}
        >
          Today
        </button>
        <button
          className="btn ghost cal-nav"
          aria-label={calMode === 'month' ? 'Next month' : 'Next week'}
          onClick={() => {
            shift(1);
          }}
        >
          ›
        </button>
        <SegmentedControl value={calMode} options={MODE_OPTIONS} onChange={setCalMode} />
        <div className="spacer" />
        <SegmentedControl value={scope} options={SCOPE_OPTIONS} onChange={setScope} />
      </div>

      <div className="cal-grid-wrap">
        {calMode === 'week' ? (
          <div className="card">
            <div className="cal-week-grid" data-testid="calendar-week-grid">
              {weekCells(week).map((iso) => {
                const isToday = iso === today;
                const list = byDate.get(iso) ?? [];
                return (
                  // Clicking anywhere in the column opens the day — the day
                  // number alone is a small target. This is a mouse
                  // accelerator layered over the real controls below (chips
                  // stop propagation, the day number stays focusable), so
                  // keyboard and screen-reader paths are unchanged.
                  <div
                    key={iso}
                    className={`cal-week-col clickable ${isToday ? 'today' : ''}`}
                    data-testid={`cal-week-col-${iso}`}
                    title={`View all tasks due ${iso}`}
                    onClick={() => {
                      openDay(iso);
                    }}
                  >
                    <div className="cal-week-head">
                      <span className="cal-dow">{DOW[dayOfWeek(iso)]}</span>
                      {list.length > 0 ? (
                        <button
                          className={`cal-daynum clickable ${isToday ? 'today' : ''}`}
                          title={`View all ${String(list.length)} tasks due this day`}
                          onClick={() => {
                            openDay(iso);
                          }}
                        >
                          {Number(iso.slice(-2))}
                        </button>
                      ) : (
                        <div className={`cal-daynum ${isToday ? 'today' : ''}`}>
                          {Number(iso.slice(-2))}
                        </div>
                      )}
                    </div>
                    <div className="cal-chips">
                      {list.slice(0, MAX_WEEK_CHIPS).map((t) => {
                        const pr = PRIORITY_COLORS[t.priority];
                        const done = t.status === 'Done';
                        return (
                          <button
                            key={t.id}
                            className={`cal-chip ${done ? 'done' : ''}`}
                            title={t.title}
                            style={done ? undefined : { background: pr.bg }}
                            onClick={(e) => {
                              // Without this the column's day handler also
                              // fires and the day dialog buries the task.
                              e.stopPropagation();
                              openTask(t.id);
                            }}
                          >
                            <Dot color={pr.dot} size={5} />
                            <span className="cal-chip-title">{t.title || 'Untitled'}</span>
                          </button>
                        );
                      })}
                      {list.length > MAX_WEEK_CHIPS && (
                        <button
                          className="cal-more"
                          onClick={() => {
                            openDay(iso);
                          }}
                        >
                          +{list.length - MAX_WEEK_CHIPS} more
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="card">
            <div className="cal-dow-row">
              {DOW.map((d) => (
                <div key={d} className="cal-dow">
                  {d}
                </div>
              ))}
            </div>
            <div className="cal-grid" data-testid="calendar-grid">
              {cells.map((iso, i) => {
                const isToday = iso === today;
                const list = iso !== null ? (byDate.get(iso) ?? []) : [];
                return (
                  <div
                    key={i}
                    className={`cal-cell ${iso === null ? 'pad' : ''} ${isToday ? 'today' : ''} ${(i + 1) % 7 === 0 ? 'last-col' : ''}`}
                  >
                    {iso !== null &&
                      (list.length > 0 ? (
                        <button
                          className={`cal-daynum clickable ${isToday ? 'today' : ''}`}
                          title={`View all ${String(list.length)} tasks due this day`}
                          onClick={() => {
                            openDay(iso);
                          }}
                        >
                          {Number(iso.slice(-2))}
                        </button>
                      ) : (
                        <div className={`cal-daynum ${isToday ? 'today' : ''}`}>
                          {Number(iso.slice(-2))}
                        </div>
                      ))}
                    <div className="cal-chips">
                      {list.slice(0, MAX_CHIPS).map((t) => {
                        const pr = PRIORITY_COLORS[t.priority];
                        const done = t.status === 'Done';
                        return (
                          <button
                            key={t.id}
                            className={`cal-chip ${done ? 'done' : ''}`}
                            title={t.title}
                            style={done ? undefined : { background: pr.bg }}
                            onClick={() => {
                              openTask(t.id);
                            }}
                          >
                            <Dot color={pr.dot} size={5} />
                            <span className="cal-chip-title">{t.title || 'Untitled'}</span>
                          </button>
                        );
                      })}
                      {iso !== null && list.length > MAX_CHIPS && (
                        <button
                          className="cal-more"
                          onClick={() => {
                            openDay(iso);
                          }}
                        >
                          +{list.length - MAX_CHIPS} more
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
        <Card title="Upcoming">
          <div className="focus-section-body">
            {upcoming.length > 0 ? (
              upcoming.map((t) => <TaskRow key={t.id} task={t} showProject />)
            ) : (
              <div className="card-empty">Nothing scheduled ahead.</div>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
