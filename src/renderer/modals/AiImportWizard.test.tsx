import { AI_IMPORT_PROJECT_ID } from '@shared/domain/ai-import';
import { seedWorkspace } from '@shared/domain/seed';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useStore } from '../app/store';
import { loadTestWorkspace, setupTestApp, TEST_TODAY } from '../test-utils';

import { ModalHost } from './TaskModal';

const EXTRACTED = [
  {
    title: 'Ship the migration report',
    notes: 'from standup',
    dueDate: '2026-07-10',
    priority: 'High' as const,
    projectHint: 'Q3 Platform Migration',
  },
  {
    title: 'Book dentist appointment',
    notes: '',
    dueDate: null,
    priority: 'Medium' as const,
    projectHint: 'Household errands',
  },
];

function openWizard(overrides = {}): ReturnType<typeof setupTestApp> {
  const workspace = seedWorkspace(TEST_TODAY);
  workspace.settings.anthropicApiKey = 'sk-ant-test';
  const api = setupTestApp(workspace, overrides);
  loadTestWorkspace(workspace);
  act(() => {
    useStore.getState().openAiImport();
  });
  render(<ModalHost />);
  return api;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('AiImportWizard', () => {
  it('requires an API key before extracting', async () => {
    const workspace = seedWorkspace(TEST_TODAY);
    const api = setupTestApp(workspace);
    loadTestWorkspace(workspace);
    act(() => {
      useStore.getState().openAiImport();
    });
    render(<ModalHost />);
    await userEvent.type(screen.getByLabelText('Text to extract tasks from'), 'do things');
    await userEvent.click(screen.getByRole('button', { name: 'Extract tasks' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Anthropic API key');
    expect(api.aiExtract).not.toHaveBeenCalled();
    // The inline shortcut jumps to Settings.
    await userEvent.click(screen.getByRole('button', { name: 'Open Settings' }));
    expect(useStore.getState().view).toBe('settings');
    expect(useStore.getState().modal).toBeNull();
  });

  it('requires text and surfaces extraction errors', async () => {
    const api = openWizard({
      aiExtract: vi.fn().mockResolvedValue({ ok: false, error: 'Anthropic rate limit hit' }),
    });
    await userEvent.click(screen.getByRole('button', { name: 'Extract tasks' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Paste some text');
    expect(api.aiExtract).not.toHaveBeenCalled();

    await userEvent.type(screen.getByLabelText('Text to extract tasks from'), 'notes');
    await userEvent.click(screen.getByRole('button', { name: 'Extract tasks' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Anthropic rate limit hit');
  });

  it('reports when no tasks were found', async () => {
    openWizard({ aiExtract: vi.fn().mockResolvedValue({ ok: true, tasks: [] }) });
    await userEvent.type(screen.getByLabelText('Text to extract tasks from'), 'nothing here');
    await userEvent.click(screen.getByRole('button', { name: 'Extract tasks' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('No tasks found');
  });

  it('walks each extracted task, pre-mapping project hints', async () => {
    const api = openWizard({
      aiExtract: vi.fn().mockResolvedValue({ ok: true, tasks: EXTRACTED }),
    });
    await userEvent.type(
      screen.getByLabelText('Text to extract tasks from'),
      'standup notes with actions',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Extract tasks' }));

    // Review step 1: hint matched the seeded project p1.
    expect(await screen.findByTestId('ai-import-progress')).toHaveTextContent('Task 1 of 2');
    expect(api.aiExtract).toHaveBeenCalledWith({
      apiKey: 'sk-ant-test',
      text: 'standup notes with actions',
      projectNames: useStore.getState().workspace?.projects.map((p) => p.name),
    });
    expect(screen.getByLabelText('Task title')).toHaveValue('Ship the migration report');
    expect(screen.getByLabelText('Project')).toHaveValue('p1');
    expect(screen.getByLabelText('Due date')).toHaveValue('2026-07-10');
    expect(screen.getByLabelText('Priority')).toHaveValue('High');

    // Tweak the title, confirm.
    await userEvent.clear(screen.getByLabelText('Task title'));
    await userEvent.type(screen.getByLabelText('Task title'), 'Ship it');
    await userEvent.click(screen.getByRole('button', { name: 'Add task' }));

    // Review step 2: unknown hint → unmapped placeholder option.
    expect(screen.getByTestId('ai-import-progress')).toHaveTextContent('Task 2 of 2 · 1 added');
    expect(screen.getByLabelText('Project')).toHaveValue('');
    await userEvent.click(screen.getByRole('button', { name: 'Add task' }));

    // Done: both tasks exist; the second created the placeholder project.
    expect(screen.getByTestId('ai-import-done')).toHaveTextContent('Added 2 tasks');
    const ws = useStore.getState().workspace;
    const t1 = ws?.tasks.find((t) => t.title === 'Ship it');
    expect(t1).toMatchObject({ projectId: 'p1', priority: 'High', tags: ['imported'] });
    const t2 = ws?.tasks.find((t) => t.title === 'Book dentist appointment');
    expect(t2?.projectId).toBe(AI_IMPORT_PROJECT_ID);
    expect(ws?.projects.some((p) => p.id === AI_IMPORT_PROJECT_ID)).toBe(true);

    await userEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(useStore.getState().modal).toBeNull();
  });

  it('skipping leaves the workspace untouched', async () => {
    openWizard({
      aiExtract: vi.fn().mockResolvedValue({ ok: true, tasks: [EXTRACTED[0]] }),
    });
    const before = useStore.getState().workspace?.tasks.length ?? 0;
    await userEvent.type(screen.getByLabelText('Text to extract tasks from'), 'notes');
    await userEvent.click(screen.getByRole('button', { name: 'Extract tasks' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Skip' }));
    expect(screen.getByTestId('ai-import-done')).toHaveTextContent('Added 0 tasks, skipped 1');
    expect(useStore.getState().workspace?.tasks).toHaveLength(before);
  });

  it('closes on backdrop click', async () => {
    openWizard();
    await userEvent.click(screen.getByTestId('ai-import-overlay'));
    expect(useStore.getState().modal).toBeNull();
  });
});
