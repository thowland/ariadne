import { z } from 'zod';

import { isValidIsoDate } from '../domain/dates';
import type { QuickAddDraft } from '../domain/quick-add';

/**
 * The menu-bar flyout's draft (D51) crosses two process boundaries on its way
 * to the main window, so main checks its shape before passing it on. Whether
 * the project still exists is the main window's question (`commitQuickAdd`),
 * since only it holds the workspace.
 */
export const quickAddDraftSchema = z.object({
  projectId: z.string().min(1),
  title: z.string().trim().min(1).max(2000),
  dueDate: z.string().refine(isValidIsoDate).nullable(),
  tags: z.array(z.string().min(1).max(200)).max(50),
  people: z
    .array(z.object({ contactId: z.string().min(1).nullable(), name: z.string().min(1).max(200) }))
    .max(50),
});

/** The draft if it is well-formed, otherwise null. */
export function parseQuickAddDraft(value: unknown): QuickAddDraft | null {
  const parsed = quickAddDraftSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}
