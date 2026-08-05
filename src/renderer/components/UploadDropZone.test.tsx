import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';

import { useStore } from '../app/store';
import { loadTestWorkspace, setupTestApp } from '../test-utils';

import { UploadDropZone } from './UploadDropZone';

let api: ReturnType<typeof setupTestApp>;

beforeEach(() => {
  api = setupTestApp();
  loadTestWorkspace();
});

/** A drop event carrying real File objects, like the OS sends. */
function drop(zone: HTMLElement, files: File[]): void {
  fireEvent.drop(zone, { dataTransfer: { files, items: [], types: ['Files'] } });
}

describe('UploadDropZone', () => {
  it('registers dropped files against the project and stores their bytes', async () => {
    render(<UploadDropZone projectId="p1" />);
    const before = useStore.getState().workspace?.files.length ?? 0;

    drop(screen.getByTestId('upload-dropzone'), [
      new File(['a,b\n'], 'data.csv', { type: 'text/csv' }),
    ]);

    await waitFor(() => {
      expect(useStore.getState().workspace?.files.length).toBe(before + 1);
    });
    const added = useStore.getState().workspace?.files.at(-1);
    expect(added).toMatchObject({ projectId: 'p1', name: 'data.csv', ext: 'csv', kind: 'file' });
    expect(api.saveBlob).toHaveBeenCalledWith(added?.id, 'csv', expect.anything());
    expect(useStore.getState().toast).toBe('1 file added to library');
  });

  it('attaches to a task when given one', async () => {
    render(<UploadDropZone projectId="p1" taskId="t2" />);
    drop(screen.getByTestId('upload-dropzone'), [new File(['x'], 'spec.pdf')]);
    await waitFor(() => {
      expect(useStore.getState().workspace?.files.at(-1)?.taskId).toBe('t2');
    });
  });

  it('highlights while a drag is over it and clears on leave', () => {
    render(<UploadDropZone projectId="p1" />);
    const zone = screen.getByTestId('upload-dropzone');
    expect(zone.className).not.toContain('over');

    fireEvent.dragEnter(zone);
    expect(zone.className).toContain('over');
    expect(screen.getByText('Release to upload')).toBeInTheDocument();

    // Entering a child element must not drop the highlight (depth counting).
    fireEvent.dragEnter(zone);
    fireEvent.dragLeave(zone);
    expect(zone.className).toContain('over');
    fireEvent.dragLeave(zone);
    expect(zone.className).not.toContain('over');
  });

  it('clears the highlight after a drop', async () => {
    render(<UploadDropZone projectId="p1" />);
    const zone = screen.getByTestId('upload-dropzone');
    const before = useStore.getState().workspace?.files.length ?? 0;
    fireEvent.dragEnter(zone);
    drop(zone, [new File(['x'], 'a.txt')]);
    expect(zone.className).not.toContain('over');
    // Wait for the upload itself to land, so nothing is still in flight when
    // the next test reads the file count.
    await waitFor(() => {
      expect(useStore.getState().workspace?.files.length).toBe(before + 1);
    });
  });

  it('ignores an empty drop', () => {
    render(<UploadDropZone projectId="p1" />);
    const before = useStore.getState().workspace?.files.length ?? 0;
    drop(screen.getByTestId('upload-dropzone'), []);
    expect(useStore.getState().workspace?.files.length).toBe(before);
  });

  it('sets dropEffect to copy so the OS shows a copy cursor', () => {
    render(<UploadDropZone projectId="p1" />);
    const dataTransfer = { dropEffect: 'none', files: [], types: ['Files'] };
    fireEvent.dragOver(screen.getByTestId('upload-dropzone'), { dataTransfer });
    expect(dataTransfer.dropEffect).toBe('copy');
  });

  it('also uploads via the hidden picker when clicked', async () => {
    render(<UploadDropZone projectId="p1" />);
    const before = useStore.getState().workspace?.files.length ?? 0;
    await userEvent.upload(
      screen.getByLabelText('Choose files to upload'),
      new File(['x'], 'picked.pdf', { type: 'application/pdf' }),
    );
    await waitFor(() => {
      expect(useStore.getState().workspace?.files.length).toBe(before + 1);
    });
    expect(useStore.getState().workspace?.files.at(-1)?.name).toBe('picked.pdf');
  });

  it('opens the picker from the keyboard', async () => {
    render(<UploadDropZone projectId="p1" />);
    const zone = screen.getByTestId('upload-dropzone');
    const input = screen.getByLabelText('Choose files to upload');
    let clicked = 0;
    input.addEventListener('click', () => {
      clicked += 1;
    });
    zone.focus();
    await userEvent.keyboard('{Enter}');
    await userEvent.keyboard(' ');
    expect(clicked).toBe(2);
  });
});
