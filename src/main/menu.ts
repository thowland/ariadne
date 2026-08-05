import type { MenuCommand } from '@shared/ipc-contract';
import { EXTERNAL_LINKS } from '@shared/ipc-contract';
import type { MenuItemConstructorOptions } from 'electron';

/**
 * The application menu template (D22). Kept free of Electron *runtime*
 * imports — only the option types — so it can be unit-tested; `index.ts`
 * feeds the result to `Menu.buildFromTemplate`.
 *
 * Everything that touches workspace data is expressed as a MenuCommand
 * pushed to the renderer, which already owns those flows (import replaces
 * the in-memory workspace, export needs the same toasts as the Settings
 * buttons). The menu itself only performs window-level roles and external
 * links, so there is exactly one implementation of each action.
 */

export interface MenuDeps {
  isMac: boolean;
  isDev: boolean;
  /** Push a command to the focused renderer. */
  send: (command: MenuCommand) => void;
  /** Open a URL in the OS browser. */
  openExternal: (url: string) => void;
}

function cmd(
  label: string,
  command: MenuCommand,
  send: MenuDeps['send'],
  accelerator?: string,
): MenuItemConstructorOptions {
  return {
    label,
    accelerator,
    click: () => {
      send(command);
    },
  };
}

function link(
  label: string,
  url: string,
  openExternal: MenuDeps['openExternal'],
): MenuItemConstructorOptions {
  return {
    label,
    click: () => {
      openExternal(url);
    },
  };
}

const SEP: MenuItemConstructorOptions = { type: 'separator' };

/** Types a platform-conditional run of items (role literals need the context). */
function group(...items: MenuItemConstructorOptions[]): MenuItemConstructorOptions[] {
  return items;
}

export function buildAppMenuTemplate({
  isMac,
  isDev,
  send,
  openExternal,
}: MenuDeps): MenuItemConstructorOptions[] {
  const about = cmd('About Ariadne', 'about', send);
  const settings = cmd('Settings…', 'goSettings', send, 'CmdOrCtrl+,');

  const appMenu: MenuItemConstructorOptions[] = isMac
    ? [
        {
          label: 'Ariadne',
          submenu: [
            about,
            SEP,
            settings,
            SEP,
            { role: 'services' },
            SEP,
            { role: 'hide' },
            { role: 'hideOthers' },
            { role: 'unhide' },
            SEP,
            { role: 'quit' },
          ],
        },
      ]
    : [];

  const fileMenu: MenuItemConstructorOptions = {
    label: 'File',
    submenu: [
      cmd('New Project', 'newProject', send, 'CmdOrCtrl+Shift+N'),
      cmd('New Task', 'newTask', send, 'CmdOrCtrl+N'),
      cmd('Import Tasks with AI…', 'aiImport', send),
      SEP,
      cmd('Export Archive…', 'exportArchive', send, 'CmdOrCtrl+Shift+E'),
      cmd('Import Archive…', 'importArchive', send, 'CmdOrCtrl+Shift+I'),
      SEP,
      cmd('Export Workspace as JSON…', 'exportJson', send),
      cmd('Import Workspace from JSON…', 'importJson', send),
      SEP,
      cmd('Back Up Now', 'backupNow', send, 'CmdOrCtrl+Alt+B'),
      cmd('Sync with Todoist', 'todoistSync', send),
      SEP,
      // Windows/Linux have no app menu, so Settings and Quit live here.
      ...(isMac ? group({ role: 'close' }) : group(settings, SEP, { role: 'quit' })),
    ],
  };

  const editMenu: MenuItemConstructorOptions = {
    label: 'Edit',
    submenu: [
      { role: 'undo' },
      { role: 'redo' },
      SEP,
      { role: 'cut' },
      { role: 'copy' },
      { role: 'paste' },
      ...(isMac
        ? group({ role: 'pasteAndMatchStyle' }, { role: 'delete' }, { role: 'selectAll' })
        : group({ role: 'delete' }, SEP, { role: 'selectAll' })),
      SEP,
      cmd('Find in Workspace', 'search', send, 'CmdOrCtrl+F'),
    ],
  };

  // Deliberately app-first: the places Ariadne can show you come before the
  // generic Chromium zoom/reload items, and the developer entries only exist
  // in a dev run.
  const viewMenu: MenuItemConstructorOptions = {
    label: 'View',
    submenu: [
      cmd('Command Center', 'goHome', send, 'CmdOrCtrl+1'),
      cmd('Calendar', 'goCalendar', send, 'CmdOrCtrl+2'),
      cmd('Reports', 'goReports', send, 'CmdOrCtrl+3'),
      cmd('Files', 'goFiles', send, 'CmdOrCtrl+4'),
      cmd('Tags', 'goTags', send, 'CmdOrCtrl+5'),
      SEP,
      {
        label: 'Scope',
        submenu: [
          cmd('All Projects', 'scopeAll', send),
          cmd('Work Only', 'scopeWork', send),
          cmd('Home Only', 'scopeHome', send),
        ],
      },
      SEP,
      { role: 'resetZoom', label: 'Actual Size' },
      { role: 'zoomIn', label: 'Zoom In' },
      { role: 'zoomOut', label: 'Zoom Out' },
      SEP,
      { role: 'togglefullscreen' },
      ...(isDev
        ? group(SEP, { role: 'reload' }, { role: 'forceReload' }, { role: 'toggleDevTools' })
        : []),
    ],
  };

  const windowMenu: MenuItemConstructorOptions = {
    label: 'Window',
    submenu: [
      { role: 'minimize' },
      ...(isMac ? group({ role: 'zoom' }, SEP, { role: 'front' }) : group({ role: 'close' })),
    ],
  };

  const helpMenu: MenuItemConstructorOptions = {
    role: 'help',
    label: 'Help',
    submenu: [
      cmd('Ariadne Help', 'help', send, isMac ? 'Cmd+?' : 'F1'),
      cmd('Keyboard Shortcuts', 'shortcuts', send),
      SEP,
      link('Ariadne on GitHub', EXTERNAL_LINKS.github, openExternal),
      link('Report an Issue', EXTERNAL_LINKS.issues, openExternal),
      SEP,
      link('timhowland.com', EXTERNAL_LINKS.author, openExternal),
      ...(isMac ? [] : [SEP, about]),
    ],
  };

  return [...appMenu, fileMenu, editMenu, viewMenu, windowMenu, helpMenu];
}
