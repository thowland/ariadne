# Changelog

## 2.7.0 — 2026-10-08

- **Add a task from the menu bar.** Turn on **Settings → Menu bar** and the
  Ariadne spiral appears in the macOS menu bar (the system tray on Windows and
  Linux). Click it and a small box opens: choose a project, type the task the
  way you would in a project's quick-add — `@` a person, `#` a tag, "friday"
  for a due date — and press Enter. It opens on the project you used last and
  stays open so you can add several in a row; Escape or a click elsewhere puts
  it away. It is off until you turn it on.
- **Sidebar groups have names, and fold away.** A divider is now a heading
  you can name — you are asked as soon as you drop one — with a twisty that
  folds the projects under it out of sight, the way the Archived list does. A
  folded group still shows its overdue count. Rename a group with the pencil
  beside its heading; moving and removing work as before.
- **Click a tag to see what carries it.** On the Tags screen, clicking a tag
  in the list opens every project, task and person with that tag right
  underneath it, each one a link. The cloud of tags at the top still searches.
- **Contact details read as text.** Someone's company, role, email and phone
  now show as plain text instead of a column of boxes. Press **Edit** on the
  Details card to change them and **Done** when you are finished; a new
  contact opens with the form ready. The email and phone buttons work either
  way.
- **Export a contact as a vCard.** **Export vCard** on a contact's page saves
  a `.vcf` card that iOS, macOS Contacts and Outlook can import, with their
  name, company, role, email, phone, notes and tags.
- In-app help covers all five.

## 2.6.0 — 2026-09-29

- **Project links are links.** A project's Links card now shows each link as
  something you click to open in your browser, instead of a pair of text
  boxes. Press **Edit** to change them; **Done** puts them back. An address
  that could not be opened (a typo, no `https://`) shows as plain text rather
  than a link that does nothing.
- **Map boxes snap into line.** On the dependency map and the organization
  map, a box you drag locks onto the row or column of any box it comes close
  to, with a dashed guide showing what it lined up with; anywhere else it
  settles onto a fine grid. Hold Option (Alt on Windows and Linux) to place a
  box exactly where you let go.
- **The Deferred report counts how often, not how far.** Clicking a due date
  forward a month at a time used to record every click as a separate
  reschedule, so one decision could top the list above the tasks you really
  do keep putting off. Changes made to a date on the same day now count once
  — and this applies to your existing history too, so the report is corrected
  the moment you upgrade. The "days pushed out" figures are gone from the top
  of the report; how far each task moved is still on its row.
- **Deferred report: incomplete only.** A new menu beside the reschedule
  threshold switches the report from all tasks to incomplete ones, so you can
  focus on what you are still putting off. It combines with the project
  menu — "Work only" plus "Incomplete only" works — and starts on all tasks.
- **Choose a contact's colour.** The coloured circle behind a person's
  initials can now be set by hand: pick from the palette in the contact's
  details, choose any colour at all, or go back to automatic. Clicking the big
  avatar at the top of their page steps through the palette. Pale colours get
  dark initials so they stay readable.
- In-app help covers all four.

## 2.5.0 — 2026-09-04

- **Tag a task while you are typing it.** Type `#` in a task title — the
  quick-add box or the task editor — and a tag picker opens, exactly the way
  `@` opens the people picker. Pick one and the tag is on the task. The word
  completes as you type — `#wood` becomes `#woodworking` — and then comes back
  out of the title once the task is entered, exactly the way a typed due date
  does: "Strip the varnish #woodworking" becomes the task "Strip the varnish",
  tagged. A `#` you never picked from the list is just text, and stays. A tag
  nobody has used before is offered on the last row of the list, so a new label
  is one keystroke more than an existing one. A tag that happens to spell a day or a month —
  `#sat`, `#mar` — no longer sets a due date you never asked for.
- **Reschedule a whole day at once.** Click a day on the calendar and its
  task list now offers **Reschedule all…**: pick a new date and everything
  still open that day moves to it. This is what a holiday, or a day you spend
  in bed, actually needs. Tasks you already finished stay where they are —
  they happened when they happened.
- **Group the project sidebar with dividers.** A divider now sits at the foot
  of the sidebar: drag it onto a project and a line appears above it,
  splitting the list into groups. Drag a line somewhere else to move it, or
  drop it outside the list to remove it. There are no group names, on
  purpose — just a line. Reordering your projects keeps the groups where they
  belong, because a divider follows the project it sits above.
- In-app help covers all three.

## 2.4.0 — 2026-08-22

- **Ask Claude about your own work.** Ariadne now ships a small read-only
  server that a local Claude can talk to, plus a skill that teaches it what to
  ask. "What's overdue?", "what did I ask Dana for?", "how is the migration
  going?", "write my standup" — it answers from your real workspace instead of
  guessing. Set it up with `npm run build && npm run install:skill`, which
  prints the one command to register it.
- **It cannot change anything, and that is deliberate.** There is no tool to
  create, edit or delete; if you ask Claude to change something it will tell
  you what to change and where. Your settings file is never read at all, since
  that is where your Todoist and Anthropic keys live.
- Nothing listens on a port and nothing goes to the network. Claude starts the
  server when it needs it and it reads the same JSON files the app does.
- The in-app help has caught up: new sections for **Contacts** and **Ask
  Claude**, and the existing ones now cover dark mode, typed due dates, effort
  estimates, drawing dependencies on the map, and hiding completed tasks.

## 2.3.0 — 2026-08-22

- **Dark mode.** Ariadne follows your operating system's light or dark setting
  out of the box, switching when it does; **Settings → Appearance** pins it to
  one or the other if you would rather it stayed put. Native menus and dialogs
  follow along. Printed and exported reports stay black-on-white whichever you
  are using — paper does not have a dark mode.
- **A date you type is taken out of the title.** "Call the vendor tomorrow"
  becomes the task "Call the vendor", due tomorrow. The words used to stay,
  which read nicely right up until you rescheduled the task and the title
  insisted on a day the due date disagreed with. The phrase stays visible and
  highlighted while you type; it goes when the task is added, or when you
  leave the title field in the editor. Waving the date off with the chip
  leaves your text exactly as written.
- **Effort estimates on tasks**, in days and hours — "2d 4h", "3h", "1.5d". It
  is effort, not calendar time: two days means two days of _work_, whenever
  they happen, and a day is eight hours. A project's header now shows how much
  work is left in it, with a note when some open tasks carry no estimate, and
  the portfolio roll-up gains a sortable **Effort left** column that also
  exports to CSV in raw hours so a spreadsheet can total it.
- **Draw dependencies on the map.** Drag one task's box on top of another and
  the dragged task now waits on the one you dropped it on, landing directly
  underneath it with the arrow drawn in. Right-click any line to remove that
  dependency. Ariadne refuses a link that would leave two tasks waiting on
  each other, and says so. The "Blocked by" checkboxes in the task editor do
  the same two things the long way, as before.
- **Fewer distracting placeholders on a contact.** The greyed-out example text
  in an empty Company or Email box now appears only while you are filling in
  somebody new. On a contact you already have, an empty box just looks empty,
  which is the point.

## 2.2.0 — 2026-08-22

- **An organization map on a contact's page.** Their manager sits above them,
  their direct reports below, and the person themself in the middle. It works
  the way the dependency map does: drag a box to put it where you want, drag
  the strip underneath to make the map taller or shorter, click a box to open
  that person, and **Reset layout** to put everything back. The arrangement is
  remembered per contact and survives a restart.
- It shows **one step each way, deliberately**. A colleague who reports to the
  same manager as you does not appear on your map — the question the page is
  answering is where _this_ person sits, not what the whole company looks like.
  A person with no reporting line either way says so instead of drawing a
  single box of themself.

## 2.1.0 — 2026-08-22

Fit and finish on Contacts, aimed at the way an organization's address book
actually arrives and gets used.

- **Import contacts from a CSV**, from the Contacts screen. You get a review
  first — how many are new, who would be updated, which rows could not be used
  — and nothing is written until you press Import, so pointing it at the wrong
  file costs a click. Somebody already in your book is **updated rather than
  duplicated** when their first name, last name and company match, whatever
  the file's capitalisation. A blank cell never clears something you already
  have, because an HR export full of empty columns should not wipe the phone
  number you took down by hand. Column headers are matched loosely — "first
  name", "First_Name" and "FIRSTNAME" are the same column, and common
  alternatives like "Full Name", "Organisation", "Job Title" and "Reports To"
  are understood — so another system's export usually just works.
- **Export contacts to a CSV.** The contact record only, not their tasks, so
  the file you get out is the file you can edit and put back. Notes that run
  to several lines and phone numbers starting with "+" both survive the round
  trip, which they did not before.
- **An envelope and a handset** beside a contact's email and phone, on their
  own page and on a project's Contacts card. The envelope opens a new message
  in your mail client; the handset dials. The copy buttons are still there for
  when you want the text instead.
- **Reporting lines.** A contact can be given a manager, and their page then
  shows both who they report to and who reports to them — each name a link to
  that person. Only one side is stored, so the two can never disagree, and the
  picker will not offer anyone who already sits beneath them, which makes a
  circular org chart impossible rather than merely discouraged. A CSV can
  carry a **Manager** column of full names; a name matching nobody is
  reported, never invented as a new person.
- **A Department field**, beside Company on the contact's page. It is searched
  and filtered along with everything else, and it travels in the CSV.
- The sample workspace gains a small reporting line — a Director of
  Engineering with two reports — so the org card has something in it on first
  run.

## 2.0.0 — 2026-08-21

The version number moves to 2.0 because Ariadne now tracks **people**, not just
work. Everything you already had is unchanged and your existing workspace opens
exactly as it did; there is simply a new half to the app.

- **Contacts (D31).** A contact has a first and last name, a company, a role, an
  email, a phone number, notes, and tags. Nothing is required beyond a name, so
  someone can be captured in three seconds and filled in later.
- **Link people to work by typing `@`.** In a task title — in the quick-add box
  or the task editor — type `@` and a few letters of a name. Pick from the list
  and the person is attached to the task, while what you typed completes to
  their full name and stays in the title — "Ask @Dana Reyes about the budget"
  still reads as a sentence. If they are not in the book yet, the last row of
  the list adds them, and you have to pick that row on purpose: pressing Enter
  on a name that matches nobody adds the **task**, not a contact, so a typo
  never turns into an address-book entry. In the quick-add box a new person is
  held as a dashed "new" chip and is only written when the task itself is
  added, so a name you correct or drop first leaves nothing behind. Every task
  also has a **People** field for the same thing the long way round.
- **A Contacts card on every project.** It lists the people attached to the
  project itself _and_ everyone linked to one of its tasks, so adding someone to
  a task puts them there with no second step. Each row opens a twisty with their
  email and phone, both click-to-copy.
- **A Contacts screen**, between Reports and Files in the sidebar (⌘4 / Ctrl+4;
  Files and Tags shift down one). Sort the whole address book by name, company,
  role, open tasks, completed tasks, project count, or last activity, filter it,
  and copy an email, a phone number, or a name straight from the list.
- **A page per contact** with their details editable in place, beside every task
  and project they touch — click any of them to go straight there. Their name,
  email, and number copy from the header.
- **Search covers people now**, across name, company, role, email, phone, notes,
  and tags. A phone number matches however you type it: `5552148890` finds
  `(555) 214-8890`.
- **A Contact activity report** — who you have actually been working with over a
  date range, ranked by how much of their work crossed your desk, with open,
  done, and overdue counts, the organizations behind them, and where the
  collaboration is concentrated. It respects the Work/Home filter like every
  other report, so a work-scoped run cannot surface the person attached to a
  personal project. When exported to PDF the copy buttons print the actual
  address and number, since paper has no clipboard.
- **A name is never mistaken for a date.** "Tom" is short for tomorrow as far
  as the date detector is concerned (v1.20), so linking Tom Whitaker used to
  quietly set a due date. Names behind an `@` are now invisible to it, while a
  real date in the same title still works: "Ask @Tom Whitaker tomorrow" links
  Tom _and_ sets tomorrow.
- **Tags now cover contacts too**, so `#vendor` or `#team` counts, renames, and
  deletions reach them along with projects and tasks.
- The sample workspace ships with seven contacts wired into its projects and
  tasks, so every one of these surfaces has something in it on first run.

Nothing talks to your operating system's address book, by design.

## 1.21.0 — 2026-08-08

- **Hide completed tasks on a project, and have it stay hidden (D30).** A
  long-running backlog fills up with finished work that crowds out what is
  actually left. The Tasks card now offers a **Hide N completed** switch, and
  the choice sticks to that project — it survives a restart and does not follow
  you to your other projects, which may well want their history in view. The
  dependency map still shows everything, so nothing points at a task that
  vanished.
- **The projects list has room to breathe.** The table sat flush against its
  card, with the column headings pressed into the top edge. It now has proper
  padding and taller rows.

## 1.20.0 — 2026-08-07

- **Type a date into a task title and Ariadne picks it up (D29).** "Call the
  vendor tomorrow", "review the deck friday", "invoice aug 5" — the phrase is
  underlined as you type and a chip beside the field shows the date it would
  set. The words stay in the title, where they read naturally. If the guess is
  wrong, click the chip and the date goes away. It understands today and
  tomorrow, weekday names and their usual abbreviations, "in 3 days", "next
  week", a month and day in either order, and a plain ISO date. It is
  deliberately cautious about what counts as a date, so "satisfy the auditor"
  and "marching orders" are left alone.
- **A project list that shows the numbers.** The PROJECTS heading in
  the sidebar was the one label in the app that did nothing; it now opens a
  sortable table of every project — type, progress, open, done, overdue, next
  due and tags. Click any heading to sort, click a row to open the project.
  Archived projects stay out of it unless you ask for them.
- **Drag a task onto a project to move it.** Pick a task up from any list and
  drop it on a project in the sidebar. Dependencies that cannot survive the
  move are unlinked, and files attached to the task go with it — the same
  rules as the existing "move tasks to project" command.
- **An optional dock badge (D28).** Ariadne can show a count on its dock icon:
  nothing (the default), tasks due today, or tasks already overdue. It counts
  your whole workspace rather than whichever Work/Home tab you last had open,
  and updates the moment the number changes. Set it in Settings → Dock badge.
  macOS and Unity-style Linux launchers show it; Windows has no equivalent.
- **A New project button** next to New task, so starting a project no longer
  means hunting for the sidebar's "+".
- **.txt and .log files preview in the app** instead of offering only a
  download, with their spacing intact.
- **Fixed: dates that do not exist were accepted.** "2026-02-30" was quietly
  treated as valid and became March 2. Impossible dates are now rejected
  wherever Ariadne validates one, including imports and stored workspaces.

## 1.19.2 — 2026-08-07

- **The deferred report's PDF export is laid out properly.** The printed page
  is built from its own stylesheet rather than the app's, and that stylesheet
  had no rules for anything the deferred report draws. The eight headline
  numbers across the top — which sit in a grid on screen — unpacked into
  sixteen stacked lines at body size, and each task's reschedule count, title
  and due label ran together. All of it now prints in the shape it has on
  screen: four columns of statistics, one line per task, and the two
  breakdowns side by side. The at-risk report shared the same missing rules
  and is fixed with it.
- **A completed task no longer looks overdue in the deferred report.** A task
  that finally shipped after several reschedules showed "Completed" in the
  same red as genuinely late work, on screen and on paper. It's now neutral.
- **The sample workspace has a reschedule history.** The deferred report was
  the one report the demo data never exercised, so a new install showed only
  its empty state — and its print bug went unnoticed. The sample data now
  covers the cases the report is built to surface, including work that slipped
  repeatedly and stayed late, and work that slipped but still got done.

## 1.19.1 — 2026-08-07

- **Fixed the macOS release build.** The pdf.js 6 upgrade in 1.19.0 brought in
  `@napi-rs/canvas`, a Node-side drawing library with prebuilt binaries that
  Ariadne never loads — the PDF viewer draws on the browser's own canvas. Its
  Apple-silicon binary was being copied into both halves of the universal Mac
  app, which the universal packager rejects, so the 1.19.0 Mac installers were
  never produced. The library is now excluded from the package. Linux and
  Windows builds were unaffected, and the app itself is unchanged.

## 1.19.0 — 2026-08-06

- **Now built on Node 24 and Electron 43.** Ariadne's toolchain had been held
  on Node 18, which reached end-of-life in April 2025 — as had Node 20, in
  April 2026. The floor is now Node 24 (supported until April 2028), which
  also lifts the cap that kept Electron at 39. Electron 43 brings four majors
  of Chromium security and rendering fixes. Nothing changes in the app's
  behaviour; PDF previews, image previews, and report PDF export were all
  re-verified against the new Chromium.
- **PDF rendering moves to pdf.js 6**, which had been held back by the same
  Node floor.

## 1.18.0 — 2026-08-06

- **Every report exports to PDF (D26).** A **PDF** button on the Reports
  screen prints whatever is on display — weekly status, portfolio roll-up,
  retrospective, at-risk or deferred — through Chromium's own print engine.
  The text stays real text, so the result is selectable and searchable, and
  the page is laid out for paper: white background, repeated table headers
  across pages, and rows that don't split down the middle. The export always
  matches the screen, current sort order included.
- **The portfolio roll-up exports to CSV (D27).** A **CSV** button next to it
  writes the table for a spreadsheet, with the next-due column as a real
  `YYYY-MM-DD` date rather than "in 3d" so it can be sorted and filtered.
- **Sortable portfolio columns (D27).** Every heading in the portfolio table
  is now clickable: the first click sorts by that column, a second reverses
  it. Counts start with the largest, names start at A. Projects with nothing
  scheduled stay at the bottom either way.
- Cleared the remaining npm advisories (`brace-expansion`, `fast-uri`,
  `postcss`, `tar`, `undici`, `dompurify`) — all build-time dependencies;
  `npm audit` reports zero.

## 1.17.0 — 2026-08-06

- **PDFs preview inline (D24).** Opening a PDF from the Files page or a
  project's Files & documents list now renders the document in the file
  viewer, with page-forward/back and zoom, instead of offering a download
  button. Ariadne draws the pages itself: Electron only hands PDFs to
  Chromium's built-in viewer for top-level navigations, so an embedded frame
  renders nothing no matter how it is configured. The renderer is bundled, so
  previews work with no network.
- **The whole week column opens the day (D25).** In the calendar's week view,
  clicking anywhere in a day — not just its date number — opens that day's
  task dialog. The number was a small target, and a day with nothing due had
  no clickable control at all. Task chips still open their own task.

## 1.16.0 — 2026-08-05

- **A real application menu (D22).** Ariadne now installs a proper
  Ariadne/File/Edit/View/Window/Help menu instead of Electron's default. On
  macOS the app menu carries About, Settings (⌘,), Services, Hide, and Quit;
  Window uses the native Minimize/Zoom/Bring All to Front roles; Help is
  tagged with the help role so macOS adds its search field. On Windows and
  Linux, Settings and Quit live in File instead. **View** leads with the
  places the app can take you — Command Center ⌘1, Calendar ⌘2, Reports ⌘3,
  Files ⌘4, Tags ⌘5, plus a Scope submenu — and the developer items (Reload,
  DevTools) only appear in a dev run.
- **macOS hidden-inset titlebar.** The traffic lights now float over the
  sidebar rather than sitting in a separate grey title strip, and the top bar
  is a window drag region.
- **Export / Import Archive (D22).** File → Export Archive… (⇧⌘E) writes a
  single `.zip` holding the workspace and every uploaded file as real files —
  far smaller than the JSON export, which inlines file bytes as base64, and
  openable with any zip tool. Import Archive… (⇧⌘I) restores one, after a
  confirmation. The JSON export/import stays for compatibility with older
  exports. Both are on the File menu and in Settings → Data.
- **About box.** Version, platform, Electron/Chromium/Node versions, and your
  data folder, with links to the GitHub repo, the issue tracker, and
  timhowland.com, plus a "Copy version details" button for bug reports.
- **Bundled help.** Help → Ariadne Help (⌘?) opens an in-app help window
  covering getting started, projects & tasks, the reports, and data &
  backups, with a keyboard-shortcuts table that shows the right modifier keys
  for your platform. It ships with the app, so it works offline and always
  matches the version you are running.
- **Drag-and-drop uploads.** The project's Files & documents card now has a
  drop zone: drag files from Finder or Explorer straight onto it, or click it
  to browse. Same handling as the Upload button — bytes are copied into your
  data folder.
- **New report: Deferred (D23).** Ariadne now records every time an open
  task's due date is pushed later, and the new report ranks the tasks you
  keep rescheduling. Pick a threshold (2/3/5/8 reschedules, default 3) and it
  lists the worst offenders with their history — first due date, current due
  date, days added, when it last moved — above analytics for the whole
  filter: total reschedules, days lost to churn, average days per push,
  median pushes per task, how many are still open and overdue, how many got
  done anyway, and breakdowns by project and by priority. Pulling a date in,
  setting a due date for the first time, and rescheduling finished work are
  not counted. Copy report works like every other report.

## 1.15.0 — 2026-08-03

- **Reschedule every overdue task at once.** The Command Center's Overdue card
  has a "Reschedule for today" button that moves the whole list onto today's
  date. It respects the Work/Home scope you are in, and confirms first, since
  it rewrites a lot of due dates and there is no undo.
- **Right-click a project in the sidebar.** Open it, archive or restore it,
  move all of its tasks into another project, reschedule just its overdue
  tasks, add a task, or delete it. Works on archived projects too, where the
  archive item becomes "Restore from archive".
- **Right-click any task, anywhere.** Set it due today, tomorrow, or next week,
  clear the due date, mark it complete (or reopen it), drop it, move it to
  another project, jump to its project, or delete it. The same menu is on task
  rows in the Command Center, project pages, search results, the calendar, and
  the day view.
- **New "Move tasks to project" dialog** behind both menus. Moving a whole
  project's tasks keeps their dependency chains intact; moving a single task
  out of a chain drops the links that would otherwise point across projects.
  Attached files follow their task. Archived projects are never offered as a
  destination.
- Menus close on Escape, on scroll, and on a click elsewhere; the keyboard
  drives them with the arrow keys, and a destructive item is never the one
  focused first. Everything the menus do is still reachable the ordinary way.

## 1.14.0 — 2026-07-31

- **Archived projects count in the retrospective (D19).** Work you finished
  before parking a project no longer vanishes from the retrospective when you
  archive it — completions in the date range are included, and the group
  header is labelled "archived" so it's clear why a parked project is listed.
  Every other report (weekly status, portfolio roll-up, at-risk) still leaves
  archived projects out, and work/home scoping is unchanged.
- **Arrangeable dependency map (D20).** Drag the nodes on a project's
  dependency map into an arrangement that reads well; the connecting lines
  rubber-band as you go and re-anchor to whichever sides of the boxes face
  each other, so chains stop crossing over themselves. Positions are saved
  per project, a drag handle under the map grows or shrinks the card (arrow
  keys work too), and "Reset layout" in the card header puts everything back
  on the automatic layers. Clicking a node still opens the task editor.

## 1.13.0 — 2026-07-21

- **Opt-in debug logging (D18).** A new Settings card turns on a plain-text
  activity log for tracking down problems: your edits and navigation, backup
  runs and pruning, Todoist push/sync attempts and failures, disk-save
  failures and write-guard rejections, imports/exports, AI extraction, and
  app start/quit — each line timestamped and category-tagged. Off by default;
  the log goes to `ariadne-debug.log` in the app's logs folder (next to
  `main.log`) or any folder you pick, rotates at 5 MB, and never leaves your
  machine. A "Show log file" button reveals it in the Finder/file manager.

## 1.12.0 — 2026-07-19

- **Filter box on the Tags manage list.** Type to narrow the management rows
  (case-insensitive substring, a leading `#` is fine); the card header shows
  the matching count and the search cloud above stays complete. Built for
  workspaces that have accumulated dozens of tags.

## 1.11.0 — 2026-07-19

- **Tag management lives on the Tags page now.** Rename (renaming onto an
  existing tag still merges after a confirm) and delete moved from Settings
  into the top-level **Tags** view, under the click-to-search cloud. The
  Settings screen loses its ever-growing tag list, so Backups, Todoist, and
  the other cards are reachable without scrolling past it.

## 1.10.0 — 2026-07-18

- **Todoist completion sync replaces the import.** Ariadne no longer pulls
  every active Todoist task into a "Todoist Inbox". Instead it watches the
  tasks you've _sent_ to Todoist (the `todoist:<id>` note markers) and, when
  you complete one in Todoist, marks it Done here with Todoist's completion
  date. Open tasks only — nothing is created, deleted, or un-dropped; the
  sync looks at the last 30 days of completions and is safe to run again.
- **Sync schedule setting.** The Settings → Todoist card gains a "Sync now"
  button and a schedule: run the check manually, every hour, or once a day
  (checked once a minute while the app is open; the last-attempt time shows
  under the card). Scheduled runs stay quiet unless they actually complete
  something.
- Existing "Todoist Inbox" projects and their tasks are untouched — they
  keep syncing completions too, and still never push back.

## 1.9.0 — 2026-07-18

- **Send a single task to Todoist**: the task editor's footer gains a
  **Send to Todoist** button. Unlike the bulk push in Settings there is no
  due-date window — undated and overdue tasks can be sent, since you picked
  the task yourself. The same safety rails apply: already-sent/imported tasks
  (`todoist:<id>` marker), Todoist Inbox tasks, closed tasks, and archived
  projects are refused with an explanation. Once a task is linked, the footer
  shows "In Todoist ✓" instead of the button, and it will never be pushed
  twice.

## 1.8.0 — 2026-07-17

- **Project-card visualizations** (Command Center portfolio): each card now
  carries three at-a-glance reads —
  - a **status-composition strip** in place of the plain progress bar
    (done / doing / blocked / waiting / todo segments, hover for counts);
  - a **momentum sparkline** of completions per week over the last 8 Sun–Sat
    weeks, current week highlighted (flat = stalled, on purpose);
  - a **due-load strip** for the current week — one cell per day shaded by
    how much is due, today ringed, past days dimmed, and any overdue tasks
    pooled in a red chip at the left. Everything has hover tooltips.

## 1.7.0 — 2026-07-17

- **Calendar week view**: a Month/Week toggle on the calendar. Week view lays
  out a single Sun–Sat week with roomier day columns, pages with the same
  ‹ Today › controls, and opens tasks/days like the month grid.
- **"Due this week" means this calendar week now**: weeks run Sunday–Saturday.
  The Command Center stat card and focus section stop at Saturday instead of
  counting 7 rolling days; a Critical/High task due next week surfaces under
  "High priority · later" until its week arrives.
- **Retrospective presets**: a range dropdown — Last week, Last month, Month
  to date, Year to date, Last 30 days — fills the date inputs; editing a date
  by hand switches to Custom range.
- **Report visualizations**: the retrospective gains a completions-over-time
  chart (daily bars up to a month of range, Sun–Sat weekly buckets beyond,
  hover for exact counts); the portfolio roll-up gains a per-project progress
  bar column; weekly status blocks summarize with done/planned/at-risk count
  pills in their headers.

## 1.6.1 — 2026-07-17

- **Security**: Electron upgraded 33.4.11 → 39.8.10, clearing all high-severity
  `npm audit` advisories (ASAR integrity bypass, several use-after-frees, IPC
  spoofing, and more). 39.8.10 is the newest major installable on the Node 18
  dev VM — Electron 40+ requires Node ≥ 22.
- Fixed the `ariadne-blob://` protocol under the new Chromium: renderer
  `fetch()` of uploaded files (CSV previews) is now CORS-enabled; image and
  PDF previews were unaffected. No user-facing behavior change.

## 1.6.0 — 2026-07-17

- **Archive projects**: an "Archive this project" checkbox on the project
  screen, or drag a project onto the sidebar's **DROP TO ARCHIVE** zone.
  Archived projects (and their tasks) disappear from the sidebar, Command
  Center, calendar, reports, Todoist push, and the task editor's project
  picker — but keep everything and come back via the sidebar's collapsible
  **ARCHIVED** section (or search) and un-checking the box.
- **Files library**: a new **Files** view (between Reports and Settings)
  lists every file across all projects and tasks, grouped by project, for
  quick browsing — rows open the regular viewer.
- **Tags view**: a new **Tags** view shows every tag in the workspace with
  usage counts; clicking one searches for it, just like clicking a tag chip
  on a project or task. Rename/merge/delete stay in Settings.
- **Stable task order while working a project**: clicking the status circle
  no longer reshuffles the project task list; the order is pinned for the
  visit and re-sorts (Doing → Todo → Waiting → Done) next time you open the
  project. New tasks append at the bottom.
- **Done can't be overdue**: completed/dropped tasks now show their old due
  date as a neutral gray date instead of a red "overdue" label — in project
  task lists and the weekly status report alike.
- **Command Center order**: focus sections now run Overdue → Due today →
  Due this week → High priority · later → Blocked.

## 1.5.0 — 2026-07-09

- **AI task import**: paste any chunk of text (meeting notes, emails, a brain
  dump) and Claude extracts the action items — with due dates resolved to real
  dates, priorities, and a suggested project. A wizard walks through each
  candidate so you can edit, re-assign, confirm, or skip it before it becomes
  a task. Tasks that don't map to an existing project are filed under a new
  "AI Imported" placeholder project until you re-file them.
- New **Integrations · Claude AI** card in Settings for the Anthropic API key
  (stored locally in plain text, like the Todoist token); "AI import…" button
  in the top bar. Extraction uses `claude-sonnet-5` via the official
  Anthropic SDK in the main process — the key never reaches the renderer.

## 1.4.0 — 2026-07-08

- **Sidebar**: reorder projects by dragging and dropping them; the order
  persists and drives the portfolio and reports everywhere.
- **At-risk redefined**: a task is at risk only if it is overdue, or directly
  depends on an overdue task (shown as "Waiting on overdue: <task>"). Having
  a dependency is how plans work — it no longer counts as risk. Applies to
  both the At-risk report and the weekly status "At risk" section.
- **Weekly status layout**: the cramped three-column layout is now stacked
  full-width sections (Done this week / Planned next / At risk).

## 1.3.0 — 2026-07-08

- **Push to Todoist** (Settings → Integrations): open tasks due within the
  next N days (configurable, 1–60, default 7) push into a Todoist **#Home**
  or **#Work** project (created if missing) with an `@project-name` label
  plus `@ariadne`, carrying due date, priority, and notes. Pushed tasks are
  marked so re-pushing never duplicates; a live preview shows how many tasks
  are ready. Pushes are idempotent even across retries (X-Request-Id).

## 1.2.0 — 2026-07-08

- **Tag autocomplete**: typing in any tag field (projects and tasks) suggests
  existing tags matching the typed prefix — pick with ↑/↓ + Enter or click;
  Enter on unmatched text still creates a new tag.
- **Tag management** (Settings → Tags): every tag with its project/task usage
  counts; rename inline (renaming onto an existing tag merges after a
  confirm), or delete a tag from everything.
- **Click-to-search**: clicking any tag chip runs a workspace-wide search for
  that tag across projects and tasks.
- Fix: the confirm dialog no longer focuses its destructive button, so the
  keystroke that triggered a confirm can never accept it in the same press.

## 1.1.0 — 2026-07-08

- **Calendar**: month cells are now a consistent fixed size regardless of how
  many tasks are due. Cells truncate to three chips plus "+N more"; clicking
  the day number (or "+N more") on any day with tasks opens a single-day view
  listing everything due, and tasks opened from it return there on close.
- **Automatic backups**: the whole workspace — JSON documents and uploaded
  files — is copied into a dated folder (`YYYY-MM-DD`) once per day and again
  when the app quits. The backup folder (default `backups/` inside the data
  directory) and retention (1–100 days, default 10) are configurable in
  Settings, alongside a "Back up now" button. Corrupt-file recovery now
  restores from these daily backups.

## 1.0.0 — 2026-07-08

First release. Ariadne is a single-user, local-first project & task tracker
built as an Electron desktop app; all data lives on your filesystem as
human-readable JSON plus ordinary files for attachments.

### Features

- **Command Center** — daily review with stat cards, an ambient overdue
  banner, focus sections (Overdue, Due today, Blocked, Due this week, High
  priority · later), and a portfolio column with progress and next-due labels
- **Projects** — editable workspace per project: tasks with inline quick-add,
  free-text notes, links, tags, Work/Home categorization
- **Tasks** — status (Todo/Doing/Waiting/Done/Dropped), priority, due dates,
  tags, notes, subtasks, links, file attachments, and predecessor
  ("Blocked by") dependencies with derived blocked indicators everywhere
- **Dependency map** — layered SVG graph of each project's task chains
- **Calendar** — month grid with priority-colored chips plus an Upcoming list
- **Document library** — per-project markdown notes (live preview/edit),
  uploads (PDF, CSV, images previewed inline; office formats downloadable),
  task attachments surface in both places
- **Reports** — weekly status, portfolio roll-up, date-ranged retrospective,
  and at-risk, all filterable by Work/Home/tag (work reports can never leak
  personal projects) and copyable as plain text
- **Todoist** — one-way import into a Todoist Inbox project with dedupe and
  re-import updates
- **Data ownership** — configurable data folder (point it at a synced
  directory), JSON export/import (accepts original prototype exports),
  rotating on-disk backups, atomic writes with corrupt-file recovery
- **No login** — single-user by design; the app opens straight into your day

### Quality

- 301 automated tests, ≥80% enforced coverage (actual ~97%), typed end to end
- Playwright E2E suite covering seed, editing, persistence-across-restart,
  library, reports, and settings flows
- Packaged for Linux (AppImage, deb); macOS/Windows targets configured
