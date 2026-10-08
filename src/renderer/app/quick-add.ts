import { commitQuickAdd } from '@shared/domain/quick-add';
import type { QuickAddDraft } from '@shared/domain/quick-add';

import { useStore } from './store';

/**
 * A task composed in the menu-bar flyout (D51), arriving in the main window,
 * which owns the workspace and so is the only place it can be created. The
 * toast is the main window's half of the receipt; the flyout shows its own.
 */
export function receiveQuickAdd(draft: QuickAddDraft): void {
  const { apply, showToast, workspace } = useStore.getState();
  const project = workspace?.projects.find((p) => p.id === draft.projectId);
  const result = apply((ws, ctx) => commitQuickAdd(ws, ctx, draft));
  if (result !== null && 'id' in result && project !== undefined) {
    showToast(`Added “${draft.title}” to ${project.name}`);
  } else {
    // The project went away (deleted, archived) between opening the flyout
    // and pressing Enter; nothing was created, so say so.
    showToast('Quick add: that project is no longer available');
  }
}
