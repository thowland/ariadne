import { z } from 'zod';

import type { IsoDate, Project, TaskPriority, Workspace } from '../types';
import { TASK_PRIORITIES } from '../types';

import { isValidIsoDate } from './dates';
import type { MutationCtx, MutationResult } from './mutate';

/**
 * AI task import (spec D12): pasted text goes to Claude (main process), which
 * returns candidate tasks; the wizard reviews them one by one. Confirmed tasks
 * without a project mapping land in a dedicated "AI Imported" placeholder
 * project so they can be re-filed once a real project exists.
 */

export const AI_IMPORT_PROJECT_ID = 'ai-import';
export const AI_IMPORT_PROJECT_NAME = 'AI Imported';

/** One task candidate as extracted by the model (already validated). */
export interface ExtractedTask {
  title: string;
  notes: string;
  /** YYYY-MM-DD, resolved by the model against today's date, or null. */
  dueDate: IsoDate | null;
  priority: TaskPriority;
  /** Existing project name the task seems to belong to, or null. */
  projectHint: string | null;
}

const extractedTaskSchema = z.object({
  title: z.string().transform((s) => s.trim()),
  notes: z.string().catch(''),
  dueDate: z.string().refine(isValidIsoDate).nullable().catch(null),
  priority: z.enum(TASK_PRIORITIES).catch('Medium'),
  projectHint: z.string().nullable().catch(null),
});

/**
 * Validate a parsed model response. Individual malformed fields fall back to
 * safe defaults; entries without a usable title are dropped. Returns null
 * only when the overall shape (an object with a tasks array) is wrong.
 */
export function parseExtraction(raw: unknown): ExtractedTask[] | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const tasks = (raw as Record<string, unknown>).tasks;
  if (!Array.isArray(tasks)) return null;
  const out: ExtractedTask[] = [];
  for (const entry of tasks) {
    const parsed = extractedTaskSchema.safeParse(entry);
    if (parsed.success && parsed.data.title !== '') out.push(parsed.data);
  }
  return out;
}

/**
 * Map the model's project hint onto an existing project: exact name match
 * (case-insensitive) first, then a unique substring match either way round.
 */
export function matchProjectHint(projects: readonly Project[], hint: string | null): string | null {
  if (hint === null) return null;
  const needle = hint.trim().toLowerCase();
  if (needle === '') return null;
  const exact = projects.find((p) => p.name.toLowerCase() === needle);
  if (exact !== undefined) return exact.id;
  const partial = projects.filter((p) => {
    const name = p.name.toLowerCase();
    return name.includes(needle) || needle.includes(name);
  });
  return partial.length === 1 && partial[0] !== undefined ? partial[0].id : null;
}

/** A reviewed wizard entry ready to become a task. */
export interface ReviewedImport {
  title: string;
  notes: string;
  dueDate: IsoDate | null;
  priority: TaskPriority;
  /** Target project; null files it under the AI Imported placeholder. */
  projectId: string | null;
}

export interface AiImportResult extends MutationResult {
  taskId: string;
  projectCreated: boolean;
}

/**
 * Create one confirmed task. When no project is chosen (or the chosen one
 * vanished), the "AI Imported" placeholder project is created on demand and
 * reused thereafter.
 */
export function importReviewedTask(
  ws: Workspace,
  ctx: MutationCtx,
  item: ReviewedImport,
): AiImportResult {
  let projects = ws.projects;
  let projectCreated = false;
  let projectId = item.projectId;
  if (projectId === null || !projects.some((p) => p.id === projectId)) {
    projectId = AI_IMPORT_PROJECT_ID;
    if (!projects.some((p) => p.id === AI_IMPORT_PROJECT_ID)) {
      projectCreated = true;
      projects = [
        ...projects,
        {
          id: AI_IMPORT_PROJECT_ID,
          name: AI_IMPORT_PROJECT_NAME,
          category: 'home',
          tags: ['imported'],
          color: '#7c4dd6',
          status: 'Active',
          notes: 'Tasks captured via AI import that are not mapped to a project yet.',
          links: [],
          createdAt: ctx.today,
        },
      ];
    }
  }

  const taskId = ctx.newId();
  const tasks = [
    ...ws.tasks,
    {
      id: taskId,
      projectId,
      title: item.title.trim() === '' ? 'Untitled task' : item.title.trim(),
      status: 'Todo' as const,
      priority: item.priority,
      tags: ['imported'],
      notes: item.notes,
      dueDate: item.dueDate,
      dependsOn: [],
      subtasks: [],
      links: [],
      createdAt: ctx.today,
      completedAt: null,
    },
  ];

  const changed: MutationResult['changed'] = projectCreated ? ['projects', 'tasks'] : ['tasks'];
  return { workspace: { ...ws, projects, tasks }, changed, taskId, projectCreated };
}
