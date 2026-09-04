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
  { id: 'contacts', label: 'Contacts' },
  { id: 'reports', label: 'Reports' },
  { id: 'data', label: 'Data & backups' },
  { id: 'claude', label: 'Ask Claude' },
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
              <strong>Sidebar</strong> — projects, the scope switch, and archived projects. The
              PROJECTS heading itself opens an inventory of every project with its counts.
            </li>
            <li>
              <strong>Calendar</strong> — month or single-week view of everything with a due date.
              Clicking a day number lists that day&rsquo;s tasks, and offers{' '}
              <strong>Reschedule all…</strong> to push the whole day onto another date — what a
              holiday or a sick day actually needs. Finished tasks stay where they are.
            </li>
            <li>
              <strong>Reports</strong> — six ways of looking at the same work, all copyable and
              exportable to PDF.
            </li>
            <li>
              <strong>Contacts</strong> — the people you work with, and what you have asked of them.
            </li>
            <li>
              <strong>Files</strong> — every uploaded document and markdown note in one library.
            </li>
            <li>
              <strong>Tags</strong> — cross-project labels, with a management list for renames.
            </li>
          </ul>
          <h3>Light and dark</h3>
          <p>
            Ariadne follows your system appearance by default and switches when it does.{' '}
            <strong>Settings → Appearance</strong> pins it to light or dark if you would rather it
            stayed put. Exported and printed reports stay black-on-white either way.
          </p>
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
          <h3>Typing a due date</h3>
          <p>
            Write the date into the title and Ariadne picks it up: “call the vendor{' '}
            <em>tomorrow</em>”, “review the deck <em>friday</em>”, “invoice <em>aug 5</em>”. The
            phrase is underlined as you type and a chip shows the date it would set; click the chip
            to wave it off. Once you accept it — by adding the task, or by leaving the title field —
            the words come out of the title, because the due date is now the single copy and the two
            would disagree the first time you rescheduled.
          </p>
          <h3>Tagging as you type</h3>
          <p>
            Type <code>#</code> and a few letters in any task title — the quick-add box or the task
            editor — and a tag picker opens the way the <code>@</code> people picker does. Pick one
            and the tag is added to the task. The word completes as you type and then comes out of
            the title when you commit the task, the way a typed due date does — the tag itself is
            the copy that lasts. A <code>#</code> you never picked is just text, and stays. A tag
            nobody has used yet is offered on the last row, so a new label costs one keystroke more
            than an existing one. A tag that happens to spell a weekday or a month —{' '}
            <code>#sat</code>, <code>#mar</code> — never sets a due date.
          </p>
          <h3>Estimates</h3>
          <p>
            A task can carry an optional estimate in days and hours — <code>2d 4h</code>,{' '}
            <code>3h</code>, <code>1.5d</code>. It is <em>effort</em>, not calendar time: two days
            means two days of work, whenever they happen, and a day is eight hours. The project
            header totals what is left, and the portfolio report has a sortable{' '}
            <strong>Effort left</strong> column.
          </p>
          <h3>Dependencies</h3>
          <p>
            A task can depend on other tasks in the same project. Anything waiting on an unfinished
            task shows as <strong>blocked</strong>, and the project&apos;s dependency map draws the
            whole chain — click a node to open that task.
          </p>
          <p>
            You can draw the links on the map itself: <strong>drag one box onto another</strong> and
            the dragged task now waits on the one you dropped it on, landing underneath it with the
            arrow in place. <strong>Right-click a line</strong> to remove that dependency. Both are
            shortcuts for the “Blocked by” checkboxes in the task editor. Ariadne refuses a link
            that would leave two tasks waiting on each other.
          </p>
          <h3>Files &amp; documents</h3>
          <p>
            Each project has a files card. Drag files from Finder or Explorer straight onto its drop
            zone, or use the buttons to browse or start a markdown note. Uploads are copied into
            your data folder, so moving or deleting the original does not break the link. Attach a
            file to a specific task from the task editor.
          </p>
          <h3>Hiding finished work</h3>
          <p>
            A long-running project fills up with completed tasks. The Tasks card offers{' '}
            <strong>Hide N completed</strong>, and the choice sticks to that project — it survives a
            restart and does not follow you elsewhere. The dependency map still shows everything, so
            no arrow ever points at a task that vanished.
          </p>
          <h3>Grouping the sidebar</h3>
          <p>
            The foot of the sidebar holds a divider: drag it onto a project and a line appears above
            that project, splitting the list into groups. Drag a line to another project to move it,
            or drop it anywhere outside the project list to remove it. A divider follows the project
            it sits above, so reordering the list keeps the groups intact.
          </p>
          <h3>Archiving</h3>
          <p>
            Archiving a project parks it: it disappears from the sidebar, Command Center, calendar,
            reports, Todoist pushes, and project pickers, but keeps every task and file and stays
            findable in search. It is the right move for finished work you do not want to delete.
          </p>
        </>
      );
    case 'contacts':
      return (
        <>
          <h3>The people behind the work</h3>
          <p>
            A contact has a name, company, department, role, email, phone, notes and tags — none of
            it required beyond a name, so somebody can be captured in three seconds and filled in
            later. The <strong>Contacts</strong> screen lists everyone with what they are carrying;
            sort by open tasks to see who you are leaning on.
          </p>
          <h3>Linking people to work</h3>
          <p>
            Type <code>@</code> and a few letters of a name in any task title — in the quick-add box
            or the task editor. Pick from the list and the person is attached to the task; the name
            completes in place and stays in the title, where it reads naturally. If they are not in
            your address book yet, the last row of the list adds them.
          </p>
          <p>
            Every project grows a <strong>Contacts</strong> card listing the people attached to the
            project itself <em>and</em> everyone on one of its tasks, so linking someone to a task
            puts them there with no second step. Each row opens to their email and phone, with a
            button to copy either and an envelope and handset that hand the address to your mail
            client or dialer.
          </p>
          <h3>Reporting lines</h3>
          <p>
            Give a contact a manager and their page shows both who they report to and who reports to
            them, each a link. The <strong>Organization map</strong> draws the same thing — manager
            above, reports below — and works like the dependency map: drag a box to place it, drag
            the strip to resize, click a box to open that person. It shows one step each way, not
            your whole company.
          </p>
          <h3>Importing and exporting</h3>
          <p>
            <strong>Import CSV…</strong> on the Contacts screen reads a spreadsheet and shows you
            what would happen — how many are new, who would be updated, which rows it could not use
            — before anything is written. Somebody whose first name, last name and company already
            match is <em>updated</em> rather than duplicated, and a blank cell never clears
            something you already have. A <strong>Manager</strong> column of full names rebuilds
            reporting lines. <strong>Export CSV</strong> writes the same shape back out.
          </p>
        </>
      );
    case 'reports':
      return (
        <>
          <h3>The six reports</h3>
          <ul>
            <li>
              <strong>Weekly status</strong> — done in the last 7 days, planned for the next 7, and
              what is at risk, grouped by project. Built for pasting into a status email.
            </li>
            <li>
              <strong>Portfolio roll-up</strong> — one row per project: open, done, overdue, effort
              left, and the next thing due. Click a column to sort by it; this is the one report
              that also exports to CSV.
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
            <li>
              <strong>Contact activity</strong> — who you have actually been working with over a
              date range, ranked, with the organizations behind them and how much of their work is
              still open.
            </li>
          </ul>
          <p>
            Every report is scoped by the picker in its toolbar (all projects, work only, home only,
            or a single tag), and <strong>Copy report</strong> puts a plain-text version on the
            clipboard. <strong>PDF</strong> prints whatever is on screen, including the sort you
            chose — always on white paper, whichever appearance you use.
          </p>
        </>
      );
    case 'data':
      return (
        <>
          <h3>Where your data lives</h3>
          <p>
            One folder on this computer: plain JSON files for projects, tasks, files, contacts and
            settings, plus a <code>blobs</code> directory holding your uploads byte-for-byte.
            Settings shows the exact path and lets you move it. Nothing is sent anywhere unless you
            turn on a Todoist or Claude integration.
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
    case 'claude':
      return (
        <>
          <h3>Ask Claude about your workspace</h3>
          <p>
            Ariadne can hand a local Claude a <strong>read-only</strong> view of your projects,
            tasks and contacts, so you can ask “what&apos;s overdue?”, “what have I asked Dana
            for?”, or “write my standup”. It answers from your real workspace instead of guessing.
          </p>
          <p>
            It is not part of this app: it is a small program Claude starts when it needs an answer.
            Nothing listens on a port, nothing goes to the network, and Ariadne does not have to be
            running — it reads the same files on disk.
          </p>
          <h3>Setting it up</h3>
          <p>
            From a checkout of the source, run <code>npm run build</code> and then{' '}
            <code>npm run install:skill</code>, which prints the one command to register it with
            Claude Code and the JSON to paste into Claude Desktop&apos;s config. The full guide is{' '}
            <code>docs/CLAUDE_MCP.md</code> in the source repository.
          </p>
          <h3>What it will not do</h3>
          <p>
            It cannot create, edit, complete or delete anything — there is no tool that writes. Ask
            Claude to change something and it will tell you what to change and where. Your settings
            file is never read at all, because that is where your Todoist and Anthropic keys live.
          </p>
          <p>
            It reads the last state saved to disk, which lands about a second after you stop typing,
            so something changed a moment ago may not be there yet.
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
