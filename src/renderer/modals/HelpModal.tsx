import { EXTERNAL_LINKS } from '@shared/ipc-contract';
import { useEffect, useState } from 'react';

import { getApi } from '../app/api';
import type { HelpSection } from '../app/store';
import { useStore } from '../app/store';

import { ExternalLink } from './AboutModal';

/**
 * Bundled help. Ships with the app rather than pointing at a website, so it
 * works offline and always matches the installed version.
 */

const SECTIONS: { id: HelpSection; label: string }[] = [
  { id: 'start', label: 'Getting started' },
  { id: 'tasks', label: 'Projects & tasks' },
  { id: 'reports', label: 'Reports' },
  { id: 'data', label: 'Data & backups' },
  { id: 'shortcuts', label: 'Keyboard shortcuts' },
];

interface Shortcut {
  keys: string;
  what: string;
}

function shortcuts(mod: string): { group: string; items: Shortcut[] }[] {
  return [
    {
      group: 'Create',
      items: [
        { keys: `${mod}N`, what: 'New task in the current project' },
        { keys: `${mod}⇧N`, what: 'New project' },
      ],
    },
    {
      group: 'Navigate',
      items: [
        { keys: `${mod}1`, what: 'Command Center' },
        { keys: `${mod}2`, what: 'Calendar' },
        { keys: `${mod}3`, what: 'Reports' },
        { keys: `${mod}4`, what: 'Contacts' },
        { keys: `${mod}5`, what: 'Files' },
        { keys: `${mod}6`, what: 'Tags' },
        { keys: `${mod},`, what: 'Settings' },
        { keys: `${mod}F`, what: 'Jump to search' },
        { keys: 'Esc', what: 'Close the open dialog' },
      ],
    },
    {
      group: 'Data',
      items: [
        { keys: `${mod}⇧E`, what: 'Export archive (.zip with your files)' },
        { keys: `${mod}⇧I`, what: 'Import archive' },
        { keys: `${mod}⌥B`, what: 'Back up now' },
      ],
    },
    {
      group: 'View',
      items: [
        { keys: `${mod}+ / ${mod}-`, what: 'Zoom in / out' },
        { keys: `${mod}0`, what: 'Actual size' },
      ],
    },
  ];
}

function Body({ section, mod }: { section: HelpSection; mod: string }): React.JSX.Element {
  switch (section) {
    case 'start':
      return (
        <>
          <h3>Ariadne in one minute</h3>
          <p>
            Everything hangs off <strong>projects</strong>. A project is either <em>work</em> or{' '}
            <em>home</em>, and that split is honored everywhere — the scope switch in the sidebar,
            the calendar, and every report — so a work status roll-up can never leak your home
            projects.
          </p>
          <p>
            The <strong>Command Center</strong> is the daily driver: what is overdue, what is due
            today, what is due this week, and what is blocked. Start there, not in the project list.
          </p>
          <ul>
            <li>
              <strong>Sidebar</strong> — projects, the scope switch, and archived projects.
            </li>
            <li>
              <strong>Calendar</strong> — month or single-week view of everything with a due date.
            </li>
            <li>
              <strong>Contacts</strong> — the people you work with, and what you have asked of them.
              Type <code>@</code> in a task title to link someone to it.
            </li>
            <li>
              <strong>Files</strong> — every uploaded document and markdown note in one library.
            </li>
            <li>
              <strong>Tags</strong> — cross-project labels, with a management list for renames.
            </li>
          </ul>
        </>
      );
    case 'tasks':
      return (
        <>
          <h3>The status cycle</h3>
          <p>
            Clicking a task&apos;s circle walks it through{' '}
            <strong>Todo → Doing → Waiting → Done → Todo</strong>. <em>Dropped</em> is deliberately
            off that path — pick it from the status menu in the task editor when work is abandoned
            rather than finished. Marking a task Done stamps its completion date, which is what the
            retrospective report reads.
          </p>
          <h3>Dependencies</h3>
          <p>
            A task can depend on other tasks in the same project. Anything waiting on an unfinished
            task shows as <strong>blocked</strong>, and the project&apos;s dependency map draws the
            whole chain — click a node to open that task.
          </p>
          <h3>Files &amp; documents</h3>
          <p>
            Each project has a files card. Drag files from Finder or Explorer straight onto its drop
            zone, or use the buttons to browse or start a markdown note. Uploads are copied into
            your data folder, so moving or deleting the original does not break the link. Attach a
            file to a specific task from the task editor.
          </p>
          <h3>Archiving</h3>
          <p>
            Archiving a project parks it: it disappears from the sidebar, Command Center, calendar,
            reports, Todoist pushes, and project pickers, but keeps every task and file and stays
            findable in search. It is the right move for finished work you do not want to delete.
          </p>
        </>
      );
    case 'reports':
      return (
        <>
          <h3>The five reports</h3>
          <ul>
            <li>
              <strong>Weekly status</strong> — done in the last 7 days, planned for the next 7, and
              what is at risk, grouped by project. Built for pasting into a status email.
            </li>
            <li>
              <strong>Portfolio roll-up</strong> — one row per project: open, done, overdue, and the
              next thing due.
            </li>
            <li>
              <strong>Retrospective</strong> — everything completed in a date range, with a
              completions-over-time chart.
            </li>
            <li>
              <strong>At-risk</strong> — overdue tasks, plus tasks waiting on an overdue dependency
              (which names the culprit).
            </li>
            <li>
              <strong>Deferred</strong> — tasks whose due date keeps sliding. Ariadne records every
              push-out, so this report can rank the work you keep putting off and tell you what the
              churn is costing in days.
            </li>
          </ul>
          <p>
            Every report is scoped by the picker in its toolbar (all projects, work only, home only,
            or a single tag), and <strong>Copy report</strong> puts a plain-text version on the
            clipboard.
          </p>
        </>
      );
    case 'data':
      return (
        <>
          <h3>Where your data lives</h3>
          <p>
            One folder on this computer: plain JSON files for projects, tasks, files, and settings,
            plus a <code>blobs</code> directory holding your uploads byte-for-byte. Settings shows
            the exact path and lets you move it. Nothing is sent anywhere unless you turn on a
            Todoist or Claude integration.
          </p>
          <h3>Backups</h3>
          <p>
            Ariadne writes a dated backup once a day (at launch, and again when you quit) and keeps
            the most recent ones — the count and folder are configurable in Settings.{' '}
            <strong>File → Back Up Now</strong> ({mod}⌥B) forces one immediately.
          </p>
          <h3>Archives vs. JSON exports</h3>
          <p>
            <strong>File → Export Archive…</strong> writes a single <code>.zip</code> containing the
            workspace and every uploaded file as real files — that is the one to keep, and the one
            to move to a new machine. The older JSON export inlines file bytes as base64, which
            makes it far larger; it remains for compatibility with earlier exports. Importing either
            one replaces the current workspace, so Ariadne asks first.
          </p>
          <h3>Integrations</h3>
          <p>
            Todoist: push tasks due in the next N days, then let the completion sync mark them done
            here when you tick them off there. Claude: paste meeting notes into the AI import and
            review the extracted tasks before any are created. Both need a key you supply in
            Settings.
          </p>
        </>
      );
    case 'shortcuts':
      return (
        <div className="help-shortcuts">
          {shortcuts(mod).map((g) => (
            <div key={g.group} className="help-shortcut-group">
              <div className="field-label">{g.group.toUpperCase()}</div>
              {g.items.map((s) => (
                <div key={s.keys} className="help-shortcut-row">
                  <kbd>{s.keys}</kbd>
                  <span>{s.what}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      );
  }
}

export function HelpModal({ section }: { section: HelpSection }): React.JSX.Element {
  const { closeModal, openHelp } = useStore();
  const [mod, setMod] = useState('Ctrl+');

  useEffect(() => {
    void getApi()
      .getAppInfo()
      .then((info) => {
        setMod(info.platform === 'darwin' ? '⌘' : 'Ctrl+');
      })
      .catch(() => {
        // Keep the portable default.
      });
  }, []);

  return (
    <div className="overlay" onClick={closeModal} data-testid="help-overlay">
      <div
        className="modal-panel help-modal"
        role="dialog"
        aria-label="Ariadne help"
        onClick={(e) => {
          e.stopPropagation();
        }}
      >
        <div className="modal-header">
          <div className="day-title">Ariadne Help</div>
          <div className="spacer" />
          <button className="modal-close" aria-label="Close" onClick={closeModal}>
            ×
          </button>
        </div>
        <div className="help-layout">
          <nav className="help-nav" aria-label="Help sections">
            {SECTIONS.map((s) => (
              <button
                key={s.id}
                className={`help-nav-item ${s.id === section ? 'on' : ''}`}
                aria-current={s.id === section ? 'page' : undefined}
                onClick={() => {
                  openHelp(s.id);
                }}
              >
                {s.label}
              </button>
            ))}
          </nav>
          <div className="help-body scr" data-testid="help-body">
            <Body section={section} mod={mod} />
            <div className="help-foot">
              Something missing or wrong?{' '}
              <ExternalLink href={EXTERNAL_LINKS.issues}>Open an issue on GitHub ↗</ExternalLink>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
