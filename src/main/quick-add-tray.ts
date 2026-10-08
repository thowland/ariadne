import type { QuickAddContext, QuickAddDraft } from '@shared/domain/quick-add';
import { IPC } from '@shared/ipc-contract';
import type { QuickAddContextResponse, QuickAddSubmitResponse } from '@shared/ipc-contract';
import { BrowserWindow, Menu, nativeImage, screen, Tray } from 'electron';

import { flyoutPosition } from './services/flyout-position';
import { TRAY_ICON_1X, TRAY_ICON_2X } from './tray-icon';

const FLYOUT_SIZE = { width: 420, height: 300 } as const;

/**
 * Clicking the icon while the flyout is open first blurs the flyout (which
 * hides it) and then delivers the click (which would show it again). A click
 * this soon after a blur-hide is that same gesture, meant to close it.
 */
const REOPEN_GUARD_MS = 300;

export interface QuickAddTrayOptions {
  isMac: boolean;
  /** Creates the flyout's BrowserWindow contents (preload + page). */
  createFlyout: (size: { width: number; height: number }) => BrowserWindow;
  mainWindow: () => BrowserWindow | null;
  lastProjectId: () => string | null;
  rememberProject: (projectId: string) => void;
  showMainWindow: () => void;
}

/**
 * The menu-bar quick-add (D51): a tray icon and the small window it opens.
 *
 * The flyout holds no data of its own. The main window owns the workspace in
 * memory, so it pushes the flyout's context (projects, people, tags, theme)
 * through `configure`, and a composed task travels back to it as a draft for
 * `commitQuickAdd` to create — writing to disk from here would be overwritten
 * by the main window's next save.
 */
export class QuickAddTray {
  private tray: Tray | null = null;
  private flyout: BrowserWindow | null = null;
  private context: QuickAddContext | null = null;
  private hiddenAt = 0;

  constructor(private readonly opts: QuickAddTrayOptions) {}

  configure(enabled: boolean, context: QuickAddContext | null): void {
    this.context = context;
    if (!enabled) {
      this.destroy();
      return;
    }
    if (this.tray === null) this.createTray();
    if (context !== null) this.flyout?.webContents.send(IPC.quickAddContextPush, context);
  }

  contextResponse(): QuickAddContextResponse {
    return { context: this.context, lastProjectId: this.opts.lastProjectId() };
  }

  submit(draft: QuickAddDraft): QuickAddSubmitResponse {
    const main = this.opts.mainWindow();
    if (main === null || main.isDestroyed()) {
      return { ok: false, error: 'Ariadne’s main window is not open.' };
    }
    this.opts.rememberProject(draft.projectId);
    main.webContents.send(IPC.quickAddCommit, draft);
    return { ok: true };
  }

  hide(): void {
    if (this.flyout?.isVisible() === true) this.flyout.hide();
  }

  /** Tears down the icon and the flyout (setting off, or the app closing). */
  destroy(): void {
    this.tray?.destroy();
    this.tray = null;
    if (this.flyout !== null && !this.flyout.isDestroyed()) this.flyout.destroy();
    this.flyout = null;
  }

  private createTray(): void {
    const image = nativeImage.createEmpty();
    image.addRepresentation({ scaleFactor: 1, dataURL: TRAY_ICON_1X });
    image.addRepresentation({ scaleFactor: 2, dataURL: TRAY_ICON_2X });
    if (this.opts.isMac) image.setTemplateImage(true);
    const tray = new Tray(image);
    tray.setToolTip('Ariadne — quick add a task');
    tray.on('click', () => {
      this.toggle();
    });
    // Linux tray hosts (AppIndicator) deliver no click events, only a menu.
    if (process.platform === 'linux') {
      tray.setContextMenu(
        Menu.buildFromTemplate([
          {
            label: 'Quick add task…',
            click: () => {
              this.show();
            },
          },
          {
            label: 'Show Ariadne',
            click: () => {
              this.opts.showMainWindow();
            },
          },
        ]),
      );
    }
    this.tray = tray;
    // Created up front, hidden, so the first click opens instantly.
    this.ensureFlyout();
  }

  private ensureFlyout(): BrowserWindow {
    if (this.flyout !== null && !this.flyout.isDestroyed()) return this.flyout;
    const win = this.opts.createFlyout(FLYOUT_SIZE);
    win.on('blur', () => {
      if (win.isVisible()) {
        this.hiddenAt = Date.now();
        win.hide();
      }
    });
    win.on('closed', () => {
      if (this.flyout === win) this.flyout = null;
    });
    this.flyout = win;
    return win;
  }

  private toggle(): void {
    if (this.flyout?.isVisible() === true) {
      this.hide();
      return;
    }
    if (Date.now() - this.hiddenAt < REOPEN_GUARD_MS) return;
    this.show();
  }

  private show(): void {
    const win = this.ensureFlyout();
    const cursor = screen.getCursorScreenPoint();
    const icon = this.tray?.getBounds() ?? null;
    const display = screen.getDisplayNearestPoint(
      icon !== null && icon.width > 0 ? { x: icon.x, y: icon.y } : cursor,
    );
    const { x, y } = flyoutPosition(icon, FLYOUT_SIZE, display.workArea, cursor);
    win.setPosition(x, y, false);
    if (this.opts.isMac) win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    win.show();
    win.focus();
    win.webContents.send(IPC.quickAddShown);
  }
}
