import type { MenuCommand } from '@shared/ipc-contract';
import { EXTERNAL_LINKS, MENU_COMMANDS } from '@shared/ipc-contract';
import type { MenuItemConstructorOptions } from 'electron';
import { describe, expect, it, vi } from 'vitest';

import { buildAppMenuTemplate } from './menu';

type Item = MenuItemConstructorOptions;

function build(over: { isMac?: boolean; isDev?: boolean } = {}): {
  template: Item[];
  send: ReturnType<typeof vi.fn>;
  openExternal: ReturnType<typeof vi.fn>;
} {
  const send = vi.fn();
  const openExternal = vi.fn();
  const template = buildAppMenuTemplate({
    isMac: over.isMac ?? false,
    isDev: over.isDev ?? false,
    send,
    openExternal,
  });
  return { template, send, openExternal };
}

function menu(template: Item[], label: string): Item[] {
  const found = template.find((m) => m.label === label);
  return (found?.submenu ?? []) as Item[];
}

/** Every item in the tree, including nested submenus. */
function flatten(items: Item[]): Item[] {
  return items.flatMap((i) => (Array.isArray(i.submenu) ? [i, ...flatten(i.submenu)] : [i]));
}

/** Invoke a menu item's click handler with throwaway Electron arguments. */
function fire(i: Item): void {
  i.click?.(undefined as never, undefined, undefined as never);
}

function item(template: Item[], label: string): Item {
  const found = flatten(template).find((i) => i.label === label);
  if (found === undefined) throw new Error(`no menu item labelled "${label}"`);
  return found;
}

describe('buildAppMenuTemplate', () => {
  it('puts the app menu first on macOS only', () => {
    expect(build({ isMac: true }).template[0]?.label).toBe('Ariadne');
    expect(build({ isMac: false }).template[0]?.label).toBe('File');
  });

  it('offers the same top-level menus on both platforms', () => {
    for (const isMac of [true, false]) {
      const labels = build({ isMac }).template.map((m) => m.label);
      expect(labels).toEqual(expect.arrayContaining(['File', 'Edit', 'View', 'Window', 'Help']));
    }
  });

  it('routes data actions to the renderer as menu commands', () => {
    const { template, send } = build();
    const clicks: [string, MenuCommand][] = [
      ['New Project', 'newProject'],
      ['New Task', 'newTask'],
      ['Export Archive…', 'exportArchive'],
      ['Import Archive…', 'importArchive'],
      ['Export Workspace as JSON…', 'exportJson'],
      ['Import Workspace from JSON…', 'importJson'],
      ['Back Up Now', 'backupNow'],
      ['Ariadne Help', 'help'],
      ['Keyboard Shortcuts', 'shortcuts'],
      ['About Ariadne', 'about'],
      ['Command Center', 'goHome'],
      ['Work Only', 'scopeWork'],
    ];
    for (const [label, command] of clicks) {
      send.mockClear();
      fire(item(template, label));
      expect(send).toHaveBeenCalledWith(command);
    }
  });

  it('only emits commands that exist in the shared contract', () => {
    const { template, send } = build({ isMac: true });
    for (const i of flatten(template)) {
      if (i.click === undefined || i.label === undefined) continue;
      send.mockClear();
      fire(i);
      const command: unknown = send.mock.calls[0]?.[0];
      // Link items call openExternal instead, so no command is recorded.
      if (command !== undefined) {
        expect(MENU_COMMANDS).toContain(command);
      }
    }
  });

  it('opens the GitHub, issues, and author links externally', () => {
    const { template, openExternal } = build();
    for (const [label, url] of [
      ['Ariadne on GitHub', EXTERNAL_LINKS.github],
      ['Report an Issue', EXTERNAL_LINKS.issues],
      ['timhowland.com', EXTERNAL_LINKS.author],
    ] as const) {
      openExternal.mockClear();
      fire(item(template, label));
      expect(openExternal).toHaveBeenCalledWith(url);
    }
  });

  it('leads the View menu with app destinations, not Chromium roles', () => {
    const view = menu(build().template, 'View');
    expect(view.slice(0, 5).map((i) => i.label)).toEqual([
      'Command Center',
      'Calendar',
      'Reports',
      'Files',
      'Tags',
    ]);
    expect(view.map((i) => i.accelerator)).toEqual(
      expect.arrayContaining(['CmdOrCtrl+1', 'CmdOrCtrl+5']),
    );
  });

  it('hides the developer items outside a dev run', () => {
    const roles = (isDev: boolean): unknown[] =>
      menu(build({ isDev }).template, 'View').map((i) => i.role);
    expect(roles(false)).not.toContain('toggleDevTools');
    expect(roles(true)).toContain('toggleDevTools');
    expect(roles(true)).toContain('reload');
  });

  it('keeps Settings and Quit in File on Windows/Linux, in the app menu on macOS', () => {
    const linuxFile = menu(build({ isMac: false }).template, 'File');
    expect(linuxFile.map((i) => i.label)).toContain('Settings…');
    expect(linuxFile.map((i) => i.role)).toContain('quit');

    const macApp = menu(build({ isMac: true }).template, 'Ariadne');
    expect(macApp.map((i) => i.label)).toContain('Settings…');
    expect(macApp.map((i) => i.role)).toContain('quit');
    expect(menu(build({ isMac: true }).template, 'File').map((i) => i.role)).not.toContain('quit');
  });

  it('uses macOS window roles only on macOS', () => {
    expect(menu(build({ isMac: true }).template, 'Window').map((i) => i.role)).toEqual([
      'minimize',
      'zoom',
      undefined,
      'front',
    ]);
    expect(menu(build({ isMac: false }).template, 'Window').map((i) => i.role)).toEqual([
      'minimize',
      'close',
    ]);
  });

  it('marks the Help menu with the help role so macOS adds its search field', () => {
    const help = build({ isMac: true }).template.find((m) => m.label === 'Help');
    expect(help?.role).toBe('help');
  });

  it('repeats About in Help where there is no app menu', () => {
    expect(menu(build({ isMac: false }).template, 'Help').map((i) => i.label)).toContain(
      'About Ariadne',
    );
    expect(menu(build({ isMac: true }).template, 'Help').map((i) => i.label)).not.toContain(
      'About Ariadne',
    );
  });
});
