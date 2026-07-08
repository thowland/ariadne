import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useStore } from '../app/store';
import { loadTestWorkspace, setupTestApp } from '../test-utils';

import { FileViewerModal, renderMarkdown } from './FileViewerModal';
import { ModalHost } from './TaskModal';

beforeEach(() => {
  setupTestApp();
  loadTestWorkspace();
});

function ws() {
  const w = useStore.getState().workspace;
  if (w === null) throw new Error('no workspace');
  return w;
}

describe('renderMarkdown', () => {
  it('renders headings, lists, code, quotes, and links', () => {
    const html = renderMarkdown(
      '# Title\n\n- item\n\n1. first\n\n> quote\n\n`code`\n\n[link](https://example.com)\n\n**bold**',
    );
    expect(html).toContain('<h1>Title</h1>');
    expect(html).toContain('<li>item</li>');
    expect(html).toContain('<blockquote>');
    expect(html).toContain('<code>code</code>');
    expect(html).toContain('href="https://example.com"');
    expect(html).toContain('<strong>bold</strong>');
  });

  it('sanitizes script injection', () => {
    const html = renderMarkdown('hello <script>alert(1)</script> <img src=x onerror=alert(1)>');
    expect(html).not.toContain('<script');
    expect(html).not.toContain('onerror');
  });

  it('labels empty documents', () => {
    expect(renderMarkdown('  ')).toContain('Empty document');
  });
});

describe('FileViewerModal', () => {
  it('previews seeded markdown and switches to the editor', async () => {
    useStore.getState().openFile('fa');
    render(<FileViewerModal fileId="fa" />);

    const preview = screen.getByTestId('md-preview');
    expect(within(preview).getByText('Q3 Platform Migration')).toBeInTheDocument();
    expect(within(preview).getByText('Provision cluster')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('tab', { name: 'Edit' }));
    const editor = screen.getByLabelText<HTMLTextAreaElement>('Markdown source');
    expect(editor.value).toContain('# Q3 Platform Migration');
  });

  it('edits content and filename with auto-save', async () => {
    useStore.getState().openFile('fb', 'edit');
    render(<FileViewerModal fileId="fb" />);

    await userEvent.type(screen.getByLabelText('Markdown source'), 'X');
    expect(
      ws()
        .files.find((f) => f.id === 'fb')
        ?.content.endsWith('X'),
    ).toBe(true);

    const name = screen.getByLabelText('File name');
    await userEvent.type(name, 'X');
    expect(ws().files.find((f) => f.id === 'fb')?.name).toBe('Rollback plan.mdX');
  });

  it('shows the reference placeholder without a download button', () => {
    useStore.getState().openFile('fc');
    render(<FileViewerModal fileId="fc" />);
    expect(screen.getByText(/Reference entry — no file stored locally/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Download file' })).not.toBeInTheDocument();
  });

  it('renders a CSV table via the blob protocol', async () => {
    const ws0 = ws();
    const csv = {
      ...ws0.files[0]!,
      id: 'csv1',
      name: 'data.csv',
      ext: 'csv',
      kind: 'file' as const,
      content: '',
      mime: 'text/csv',
      size: 20,
    };
    loadTestWorkspace({ ...ws0, files: [...ws0.files, csv] });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        text: () => Promise.resolve('name,qty\nrope,2\n"tar, pitch",1'),
      }),
    );
    try {
      useStore.getState().openFile('csv1');
      render(<FileViewerModal fileId="csv1" />);
      const table = await screen.findByTestId('csv-table');
      expect(vi.mocked(fetch)).toHaveBeenCalledWith('ariadne-blob://csv1');
      expect(within(table).getByRole('columnheader', { name: 'name' })).toBeInTheDocument();
      expect(within(table).getByText('tar, pitch')).toBeInTheDocument();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('offers download-only placeholders for office formats', () => {
    const ws0 = ws();
    const docx = {
      ...ws0.files[0]!,
      id: 'docx1',
      name: 'spec.docx',
      ext: 'docx',
      kind: 'file' as const,
      content: '',
      mime: '',
      size: 10,
    };
    loadTestWorkspace({ ...ws0, files: [...ws0.files, docx] });
    useStore.getState().openFile('docx1');
    render(<FileViewerModal fileId="docx1" />);
    expect(screen.getByText(/Preview not available for .DOCX files/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Download file' })).toBeInTheDocument();
  });

  it('returns to the owning task via Back to task', async () => {
    render(<ModalHost />);
    act(() => {
      useStore.getState().openTask('t1');
      useStore.getState().openFile('fa'); // captures the task as back target
    });
    expect(screen.getByRole('dialog', { name: 'File viewer' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: '‹ Back to task' }));
    expect(useStore.getState().modal).toEqual({ type: 'task', id: 't1' });
    expect(screen.getByRole('dialog', { name: 'Edit task' })).toBeInTheDocument();
  });

  it('renders nothing for a vanished file id', () => {
    render(<FileViewerModal fileId="ghost" />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
