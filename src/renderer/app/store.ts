import { todayIso } from '@shared/domain/clock';
import type { Scope } from '@shared/domain/derive';
import { newId } from '@shared/domain/id';
import type { MutationCtx, MutationResult } from '@shared/domain/mutate';
import { createProject, createTask, updateSettings } from '@shared/domain/mutate';
import { applyTodoistCompletions, TODOIST_SYNC_LOOKBACK_DAYS } from '@shared/domain/todoist';
import type { WorkspaceSavePayload } from '@shared/ipc-contract';
import type { IsoDate, Workspace } from '@shared/types';
import { create } from 'zustand';

import { getApi } from './api';

export type Mutation<R extends MutationResult> = (ws: Workspace, ctx: MutationCtx) => R;

export type ViewName = 'home' | 'calendar' | 'project' | 'reports' | 'files' | 'tags' | 'settings';

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
export type ModalState =
  TaskModalState | FileModalState | DayModalState | AiImportModalState | null;

export type FileMode = 'preview' | 'edit';

export interface ConfirmState {
  message: string;
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
  /** Opens the task editor modal over the current view. */
  openTask: (id: string) => void;
  /** Opens the single-day view (calendar truncation). */
  openDay: (iso: IsoDate) => void;
  /** Opens the AI task import wizard. */
  openAiImport: () => void;
  /** Opens the file viewer; remembers an open task modal to return to. */
  openFile: (id: string, mode?: FileMode) => void;
  setFileMode: (mode: FileMode) => void;
  closeModal: () => void;
  setQuery: (q: string) => void;
  setScope: (scope: Scope) => void;
  showToast: (message: string) => void;
  /** In-app confirm dialog; resolves true when the user confirms. */
  askConfirm: (message: string) => Promise<boolean>;
  resolveConfirm: (confirmed: boolean) => void;
  setCalMonth: (month: string | null) => void;
  setCalMode: (mode: 'month' | 'week') => void;
  setCalWeek: (anchor: IsoDate | null) => void;
  /** Sidebar "+" — create a project and jump to it. */
  newProject: () => void;
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
    try {
      const now = new Date();
      const since = new Date(now.getTime() - TODOIST_SYNC_LOOKBACK_DAYS * 86_400_000);
      const res = await getApi().todoistCompleted(token, since.toISOString(), now.toISOString());
      // Stamp the attempt win or lose, so a failing endpoint is retried on
      // the next scheduled slot rather than every minute.
      get().apply((ws) => updateSettings(ws, { lastTodoistSyncAt: now.toISOString() }));
      if (!res.ok) {
        if (!auto) get().showToast(res.error);
        return;
      }
      const result = get().apply((ws, ctx) => applyTodoistCompletions(ws, ctx, res.items));
      const n = result?.completed ?? 0;
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
  q: '',
  scope: 'all',
  toast: null,
  modal: null,
  confirmState: null,
  calMonth: null,
  calMode: 'month',
  calWeek: null,
  fileMode: 'preview',

  go: (view) => {
    set({ view, q: '' });
  },

  openProject: (id) => {
    set({ view: 'project', activeProjectId: id, q: '' });
  },

  openTask: (id) => {
    if (get().workspace?.tasks.some((x) => x.id === id) === true) {
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

  askConfirm: (message) =>
    new Promise<boolean>((resolve) => {
      set({ confirmState: { message, resolve } });
    }),

  resolveConfirm: (confirmed) => {
    const pending = get().confirmState;
    set({ confirmState: null });
    pending?.resolve(confirmed);
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
