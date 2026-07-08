import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';

import { useStore } from '../app/store';
import { loadTestWorkspace, setupTestApp } from '../test-utils';

import { FileRow, humanSize } from './FileRow';

beforeEach(() => {
  setupTestApp();
  loadTestWorkspace();
});

function file(id: string) {
  const f = useStore.getState().workspace?.files.find((x) => x.id === id);
  if (f === undefined) throw new Error(`no file ${id}`);
  return f;
}

describe('humanSize', () => {
  it('formats byte counts', () => {
    expect(humanSize(0)).toBe('');
    expect(humanSize(512)).toBe('512 B');
    expect(humanSize(2048)).toBe('2 KB');
    expect(humanSize(3_670_016)).toBe('3.5 MB');
  });
});

describe('FileRow', () => {
  it('shows badge, name, and kind for markdown and refs', () => {
    render(<FileRow file={file('fa')} />);
    expect(screen.getByText('MD')).toBeInTheDocument();
    expect(screen.getByText('Migration overview.md')).toBeInTheDocument();
    expect(screen.getByText('Markdown')).toBeInTheDocument();

    render(<FileRow file={file('fc')} />);
    expect(screen.getByText('PDF')).toBeInTheDocument();
    expect(screen.getByText('Reference')).toBeInTheDocument();
  });

  it('labels the owning task for attachments', () => {
    const ws0 = useStore.getState().workspace;
    if (ws0 === null) throw new Error('no ws');
    const attached = { ...ws0.files[0]!, id: 'att1', taskId: 't2' };
    loadTestWorkspace({ ...ws0, files: [...ws0.files, attached] });
    render(<FileRow file={attached} />);
    expect(screen.getByText(/Provision new k8s clus/)).toBeInTheDocument();
  });

  it('opens the viewer on click', async () => {
    render(<FileRow file={file('fa')} />);
    await userEvent.click(screen.getByTestId('file-row-fa'));
    expect(useStore.getState().modal).toMatchObject({ type: 'file', id: 'fa' });
    expect(useStore.getState().fileMode).toBe('preview');
  });

  it('download button does not open the viewer', async () => {
    render(<FileRow file={file('fa')} />);
    await userEvent.click(screen.getByTitle('Download'));
    expect(useStore.getState().modal).toBeNull();
    expect(window.ariadne.downloadFile).toHaveBeenCalled();
  });
});
