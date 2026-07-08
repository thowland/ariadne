import {
  monthCells,
  monthTitle,
  shiftMonth,
  tasksByDueDate,
  upcomingTasks,
} from '@shared/domain/calendar';
import { monthKey } from '@shared/domain/dates';
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

/** Month grid + upcoming list (prototype viewCalendar). */
export function Calendar(): React.JSX.Element {
  const { workspace, today, scope, setScope, calMonth, setCalMonth, openTask } = useStore();
  const month = calMonth ?? monthKey(today);

  const scoped = tasksInScope(workspace?.tasks ?? [], workspace?.projects ?? [], scope);
  const byDate = tasksByDueDate(scoped);
  const upcoming = upcomingTasks(scoped, today);
  const cells = monthCells(month);

  return (
    <div className="view-wrap fadein" style={{ maxWidth: 1180 }}>
      <div className="cal-header">
        <h1 className="cal-title">{monthTitle(month)}</h1>
        <button
          className="btn ghost cal-nav"
          aria-label="Previous month"
          onClick={() => {
            setCalMonth(shiftMonth(month, -1));
          }}
        >
          ‹
        </button>
        <button
          className="btn ghost"
          onClick={() => {
            setCalMonth(null);
          }}
        >
          Today
        </button>
        <button
          className="btn ghost cal-nav"
          aria-label="Next month"
          onClick={() => {
            setCalMonth(shiftMonth(month, 1));
          }}
        >
          ›
        </button>
        <div className="spacer" />
        <SegmentedControl value={scope} options={SCOPE_OPTIONS} onChange={setScope} />
      </div>

      <div className="cal-grid-wrap">
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
                  {iso !== null && (
                    <div className={`cal-daynum ${isToday ? 'today' : ''}`}>
                      {Number(iso.slice(-2))}
                    </div>
                  )}
                  <div className="cal-chips">
                    {list.slice(0, 4).map((t) => {
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
                    {list.length > 4 && <span className="cal-more">+{list.length - 4} more</span>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
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
