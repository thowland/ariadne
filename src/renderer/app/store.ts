import { todayIso } from '@shared/domain/clock';
import type { ContactImportPlan } from '@shared/domain/contact-csv';
import type { Scope } from '@shared/domain/derive';
import { newId } from '@shared/domain/id';
import type { MutationCtx, MutationResult } from '@shared/domain/mutate';
import { createContact, createProject, createTask, updateSettings } from '@shared/domain/mutate';
import { applyTodoistCompletions, TODOIST_SYNC_LOOKBACK_DAYS } from '@shared/domain/todoist';
import type {
  DebugLogCategory,
  TodoistCompletedResponse,
  WorkspaceSavePayload,
} from '@shared/ipc-contract';
import type { IsoDate, Workspace } from '@shared/types';
import { create } from 'zustand';

import { getApi } from './api';

/** Send a debug-log line to the main process (D18); silent unless enabled. */
function logDebug(ws: Workspace | null, category: DebugLogCategory, message: string): void {
  if (ws?.settings.debugLogging === true) getApi().logEvent(category, message);
}

export type Mutation<R extends MutationResult> = (ws: Workspace, ctx: MutationCtx) => R;

export type ViewName =
  | 'home'
  | 'calendar'
  | 'project'
  | 'projects'
  | 'reports'
  | 'contacts'
  | 'contact'
  | 'files'
  | 'tags'
  | 'settings';

export interface DayModalState {
  type: 'day';
  iso: IsoDate;
}
export interface TaskModalState {
  type: 'task';
  id: string;
  /** Set when opened from the day view, to return there on close. */
  back?: DayModalState;
}
export interface FileModalState {
  type: 'file';
  id: string;
  /** Set when opened from a task, to return there on close. */
  back?: TaskModalState;
}
export interface AiImportModalState {
  type: 'aiImport';
}
/** Review step of a contacts CSV import (D33); the plan is already computed. */
export interface ContactImportModalState {
  type: 'contactImport';
  fileName: string;
  plan: ContactImportPlan;
}
/** Bulk "move tasks to project…" picker (D21), from either context menu. */
export interface MoveTasksModalState {
  type: 'moveTasks';
  taskIds: string[];
  /** Project the tasks come from; excluded from the target list. */
  fromProjectId: string | null;
  /** Sentence describing what is being moved, e.g. "5 tasks in Q3 Migration". */
  what: string;
}
/** One row of a context menu. */
export interface ContextMenuItem {
  label: string;
  onSelect: () => void;
  /** Renders in the danger color and is never the initially focused row. */
  danger?: boolean;
  disabled?: boolean;
  /** Draws a divider above this row, grouping related actions. */
  separatorBefore?: boolean;
}

export interface ContextMenuState {
  /** Viewport coordinates of the click that opened it. */
  x: number;
  y: number;
  /** Accessible name — what the menu acts on, e.g. a project or task title. */
  label: string;
  items: ContextMenuItem[];
}
export interface AboutModalState {
  type: 'about';
}
export type HelpSection = 'start' | 'tasks' | 'reports' | 'data' | 'shortcuts';
export interface HelpModalState {
  type: 'help';
  section: HelpSection;
}
export type ModalState =
  | TaskModalState
  | FileModalState
  | DayModalState
  | AiImportModalState
  | ContactImportModalState
  | MoveTasksModalState
  | AboutModalState
  | HelpModalState
  | null;

export type FileMode = 'preview' | 'edit';

export interface ConfirmState {
  message: string;
  /** Label of the accept button; "Delete" unless the action isn't one. */
  confirmLabel: string;
  /** False for reversible bulk edits, which get a neutral accept button. */
  danger: boolean;
  resolve: (confirmed: boolean) => void;
}

export interface AriadneStore {
  // ----- data slice -----
  workspace: Workspace | null;
  today: IsoDate;
  loaded: boolean;
  firstRun: boolean;
  warnings: string[];

  /** Load the workspace from disk (startup). */
  load: () => Promise<void>;
  /**
   * Run a pure mutation, update state, and write changed collections through
   * to the main process (auto-save; debounced on the main side). Returns the
   * mutation's full result (created ids, removed blob ids, …).
   */
  apply: <R extends MutationResult>(mutation: Mutation<R>) => R | null;
  /** Re-evaluate `today` (window focus / midnight rollover). */
  refreshToday: () => void;
  /** True while the main process reports failing disk writes (banner). */
  saveBroken: boolean;
  setSaveBroken: (broken: boolean) => void;
  /** True while a Todoist completion sync is in flight (guards overlap). */
  todoistSyncing: boolean;
  /**
   * Todoist completion sync (D17): fetch recently completed items and mark
   * the matching pushed tasks Done. `auto` runs stay quiet unless something
   * actually changed; manual runs always toast the outcome.
   */
  runTodoistSync: (auto?: boolean) => Promise<void>;

  // ----- ui slice (never persisted) -----
  view: ViewName;
  activeProjectId: string | null;
  /** Contact whose detail page is open; null on every other view. */
  activeContactId: string | null;
  q: string;
  scope: Scope;
  toast: string | null;
  modal: ModalState;
  confirmState: ConfirmState | null;
  /** Calendar month being viewed; null = the month containing today. */
  calMonth: string | null;
  /** Calendar layout: month grid or single Sun–Sat week. */
  calMode: 'month' | 'week';
  /** Anchor date of the week being viewed; null = the week containing today. */
  calWeek: IsoDate | null;
  /** File viewer mode; reset to preview on open. */
  fileMode: FileMode;

  go: (view: ViewName) => void;
  openProject: (id: string) => void;
  /** Opens a contact's detail page (D31). */
  openContact: (id: string) => void;
  /** Opens the task editor modal over the current view. */
  openTask: (id: string) => void;
  /** Opens the single-day view (calendar truncation). */
  openDay: (iso: IsoDate) => void;
  /** Opens the AI task import wizard. */
  openAiImport: () => void;
  /** Opens the contacts CSV review dialog (D33). */
  openContactImport: (state: Omit<ContactImportModalState, 'type'>) => void;
  /** Opens the bulk move-to-project picker (D21). */
  openMoveTasks: (state: Omit<MoveTasksModalState, 'type'>) => void;
  /** Opens the About box (Help/app menu). */
  openAbout: () => void;
  /** Opens the in-app help window at a section. */
  openHelp: (section?: HelpSection) => void;
  /** Opens the file viewer; remembers an open task modal to return to. */
  openFile: (id: string, mode?: FileMode) => void;
  setFileMode: (mode: FileMode) => void;
  closeModal: () => void;
  setQuery: (q: string) => void;
  setScope: (scope: Scope) => void;
  showToast: (message: string) => void;
  /**
   * In-app confirm dialog; resolves true when the user confirms. `opts` retitles
   * the accept button for actions that aren't deletions (bulk reschedules and
   * moves, which are heavy enough to confirm but not destructive).
   */
  askConfirm: (
    message: string,
    opts?: { confirmLabel?: string; danger?: boolean },
  ) => Promise<boolean>;
  resolveConfirm: (confirmed: boolean) => void;
  /** Right-click menu (D21); only one is ever open. */
  contextMenu: ContextMenuState | null;
  openContextMenu: (menu: ContextMenuState) => void;
  closeContextMenu: () => void;
  setCalMonth: (month: string | null) => void;
  setCalMode: (mode: 'month' | 'week') => void;
  setCalWeek: (anchor: IsoDate | null) => void;
  /** Sidebar "+" — create a project and jump to it. */
  newProject: () => void;
  /**
   * Create a blank contact and open its detail page. Returns the new id so
   * callers that are mid-flow (the @-mention picker, the project card) can
   * link it to whatever they were editing.
   */
  newContact: (patch?: Parameters<typeof createContact>[2]) => string | null;
  /** Top bar "+ New task" — create in the active (or first) project and edit it. */
  newTaskGlobal: () => void;
}

let toastTimer: ReturnType<typeof setTimeout> | null = null;

export const useStore = create<AriadneStore>((set, get) => ({
  workspace: null,
  today: todayIso(),
  loaded: false,
  firstRun: false,
  warnings: [],

  load: async () => {
    const api = getApi();
    set({ today: todayIso(api.fakeToday ?? undefined) });
    const res = await api.loadWorkspace();
    set({
      workspace: res.workspace,
      loaded: true,
      firstRun: res.firstRun,
      warnings: res.warnings,
    });
  },

  apply: <R extends MutationResult>(mutation: Mutation<R>): R | null => {
    const { workspace, today } = get();
    if (workspace === null) return null;
    const result = mutation(workspace, { today, newId });
    if (result.changed.length === 0) return result;
    set({ workspace: result.workspace });

    const payload: WorkspaceSavePayload = {};
    for (const name of result.changed) {
      // Collections share the Workspace field names by design.
      (payload as Record<string, unknown>)[name] = result.workspace[name];
    }
    if (result.replaceAll === true) payload.replaceAll = true;
    void getApi()
      .saveCollections(payload)
      .then((res) => {
        // A rejected write means memory and disk have diverged — say so
        // instead of letting the user believe the change persisted.
        if (res.rejected.length > 0) {
          get().showToast(
            `Some changes were NOT saved (${res.rejected.map((r) => r.name).join(', ')}) — please report this`,
          );
        }
      });
    // Activity trail: which collections changed and how their sizes moved.
    // Gated on the post-mutation settings so toggling logging off is silent;
    // sent after the save so the edit that turns logging ON is itself logged
    // (the main process enables the log while handling that save).
    const summary = result.changed
      .map((name) => {
        const before = workspace[name];
        const after = result.workspace[name];
        return Array.isArray(before) && Array.isArray(after)
          ? `${name} ${String(before.length)}→${String(after.length)}`
          : name;
      })
      .join(', ');
    logDebug(result.workspace, 'activity', `edit applied: ${summary}`);
    return result;
  },

  refreshToday: () => {
    set({ today: todayIso(getApi().fakeToday ?? undefined) });
  },

  saveBroken: false,
  setSaveBroken: (broken) => {
    set({ saveBroken: broken });
  },

  todoistSyncing: false,

  runTodoistSync: async (auto = false) => {
    const { workspace, todoistSyncing, showToast } = get();
    if (todoistSyncing || workspace === null) return;
    const token = workspace.settings.todoistToken;
    if (token.trim() === '') {
      if (!auto) showToast('Add your Todoist API token first');
      return;
    }
    set({ todoistSyncing: true });
    logDebug(workspace, 'todoist', `completion sync started (${auto ? 'scheduled' : 'manual'})`);
    try {
      const now = new Date();
      const since = new Date(now.getTime() - TODOIST_SYNC_LOOKBACK_DAYS * 86_400_000);
      let res: TodoistCompletedResponse;
      try {
        res = await getApi().todoistCompleted(token, since.toISOString(), now.toISOString());
      } catch {
        // An IPC-level rejection (should not happen — the service maps its
        // errors) still deserves a clean message, not a dropped promise.
        res = { ok: false, error: 'Todoist sync failed unexpectedly — try again' };
      }
      // Stamp the attempt win or lose, so a failing endpoint is retried on
      // the next scheduled slot rather than every minute.
      get().apply((ws) => updateSettings(ws, { lastTodoistSyncAt: now.toISOString() }));
      if (!res.ok) {
        if (!auto) get().showToast(res.error);
        return;
      }
      const result = get().apply((ws, ctx) => applyTodoistCompletions(ws, ctx, res.items));
      const n = result?.completed ?? 0;
      logDebug(get().workspace, 'todoist', `completion sync: ${String(n)} task(s) marked done`);
      if (n > 0) {
        get().showToast(`Marked ${String(n)} task${n === 1 ? '' : 's'} done from Todoist`);
      } else if (!auto) {
        get().showToast('Nothing new completed in Todoist');
      }
    } finally {
      set({ todoistSyncing: false });
    }
  },

  // ----- ui slice -----
  view: 'home',
  activeProjectId: null,
  activeContactId: null,
  q: '',
  scope: 'all',
  toast: null,
  modal: null,
  confirmState: null,
  calMonth: null,
  calMode: 'month',
  calWeek: null,
  fileMode: 'preview',
  // (contextMenu is declared with its actions below.)

  go: (view) => {
    logDebug(get().workspace, 'activity', `navigate: ${view}`);
    set({ view, q: '' });
  },

  openProject: (id) => {
    logDebug(get().workspace, 'activity', `navigate: project ${id}`);
    set({ view: 'project', activeProjectId: id, q: '' });
  },

  openContact: (id) => {
    if (get().workspace?.contacts.some((c) => c.id === id) === true) {
      logDebug(get().workspace, 'activity', `navigate: contact ${id}`);
      set({ view: 'contact', activeContactId: id, q: '' });
    }
  },

  openTask: (id) => {
    if (get().workspace?.tasks.some((x) => x.id === id) === true) {
      logDebug(get().workspace, 'activity', `open task ${id}`);
      const current = get().modal;
      const back = current?.type === 'day' ? current : undefined;
      set({ modal: { type: 'task', id, back } });
    }
  },

  openDay: (iso) => {
    set({ modal: { type: 'day', iso } });
  },

  openAiImport: () => {
    set({ modal: { type: 'aiImport' } });
  },

  openContactImport: (state) => {
    set({ modal: { type: 'contactImport', ...state } });
  },

  openMoveTasks: (state) => {
    set({ modal: { type: 'moveTasks', ...state } });
  },

  openAbout: () => {
    set({ modal: { type: 'about' } });
  },

  openHelp: (section = 'start') => {
    set({ modal: { type: 'help', section } });
  },

  openFile: (id, mode = 'preview') => {
    const current = get().modal;
    const back = current?.type === 'task' ? current : undefined;
    set({ modal: { type: 'file', id, back }, fileMode: mode });
  },

  setFileMode: (mode) => {
    set({ fileMode: mode });
  },

  closeModal: () => {
    const current = get().modal;
    // Closing a stacked modal returns to what opened it (file → task → day).
    if (
      current !== null &&
      (current.type === 'task' || current.type === 'file') &&
      current.back !== undefined
    ) {
      set({ modal: current.back });
    } else {
      set({ modal: null });
    }
  },

  setQuery: (q) => {
    set({ q });
  },

  setScope: (scope) => {
    set({ scope });
  },

  askConfirm: (message, opts) =>
    new Promise<boolean>((resolve) => {
      set({
        confirmState: {
          message,
          confirmLabel: opts?.confirmLabel ?? 'Delete',
          danger: opts?.danger ?? true,
          resolve,
        },
      });
    }),

  resolveConfirm: (confirmed) => {
    const pending = get().confirmState;
    set({ confirmState: null });
    pending?.resolve(confirmed);
  },

  contextMenu: null,

  openContextMenu: (menu) => {
    set({ contextMenu: menu });
  },

  closeContextMenu: () => {
    set({ contextMenu: null });
  },

  setCalMonth: (month) => {
    set({ calMonth: month });
  },

  setCalMode: (mode) => {
    set({ calMode: mode });
  },

  setCalWeek: (anchor) => {
    set({ calWeek: anchor });
  },

  showToast: (message) => {
    set({ toast: message });
    if (toastTimer !== null) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      set({ toast: null });
    }, 2600);
  },

  newProject: () => {
    const result = get().apply((ws, ctx) => createProject(ws, ctx));
    if (result !== null) {
      get().openProject(result.id);
      get().showToast('Project created');
    }
  },

  newContact: (patch = {}) => {
    const result = get().apply((ws, ctx) => createContact(ws, ctx, patch));
    return result?.id ?? null;
  },

  newTaskGlobal: () => {
    const { workspace, activeProjectId } = get();
    // Validate the active project still exists before targeting it.
    const active = workspace?.projects.find((p) => p.id === activeProjectId);
    const pid = active?.id ?? workspace?.projects.find((p) => p.archived !== true)?.id;
    if (pid === undefined) {
      get().newProject();
      return;
    }
    const result = get().apply((ws, ctx) => createTask(ws, ctx, pid, {}));
    if (result !== null) get().openTask(result.id);
  },
}));
