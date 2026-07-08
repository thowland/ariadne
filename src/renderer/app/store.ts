import { todayIso } from '@shared/domain/clock';
import type { Scope } from '@shared/domain/derive';
import { newId } from '@shared/domain/id';
import type { MutationCtx, MutationResult } from '@shared/domain/mutate';
import { createProject, createTask } from '@shared/domain/mutate';
import type { WorkspaceSavePayload } from '@shared/ipc-contract';
import type { IsoDate, Workspace } from '@shared/types';
import { create } from 'zustand';

import { getApi } from './api';

export type Mutation<R extends MutationResult> = (ws: Workspace, ctx: MutationCtx) => R;

export type ViewName = 'home' | 'calendar' | 'project' | 'reports' | 'settings';

/** File viewer joins in Sprint 5. */
export type ModalState = { type: 'task'; id: string } | null;

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

  go: (view: ViewName) => void;
  openProject: (id: string) => void;
  /** Opens the task editor modal over the current view. */
  openTask: (id: string) => void;
  closeModal: () => void;
  setQuery: (q: string) => void;
  setScope: (scope: Scope) => void;
  showToast: (message: string) => void;
  /** In-app confirm dialog; resolves true when the user confirms. */
  askConfirm: (message: string) => Promise<boolean>;
  resolveConfirm: (confirmed: boolean) => void;
  setCalMonth: (month: string | null) => void;
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
    void getApi().saveCollections(payload);
    return result;
  },

  refreshToday: () => {
    set({ today: todayIso(getApi().fakeToday ?? undefined) });
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

  go: (view) => {
    set({ view, q: '' });
  },

  openProject: (id) => {
    set({ view: 'project', activeProjectId: id, q: '' });
  },

  openTask: (id) => {
    if (get().workspace?.tasks.some((x) => x.id === id) === true) {
      set({ modal: { type: 'task', id } });
    }
  },

  closeModal: () => {
    set({ modal: null });
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
    const pid = active?.id ?? workspace?.projects[0]?.id;
    if (pid === undefined) {
      get().newProject();
      return;
    }
    const result = get().apply((ws, ctx) => createTask(ws, ctx, pid, {}));
    if (result !== null) get().openTask(result.id);
  },
}));
