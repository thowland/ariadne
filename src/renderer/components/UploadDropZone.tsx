import { useRef, useState } from 'react';

import { uploadFiles } from '../app/files';

/**
 * Drag-and-drop upload target for a project's file library. Files dropped
 * from the OS are copied into the workspace exactly like the Upload button's
 * picker — the zone is a second route into `uploadFiles`, not a second
 * implementation of uploading.
 */
export function UploadDropZone({
  projectId,
  taskId = null,
}: {
  projectId: string;
  taskId?: string | null;
}): React.JSX.Element {
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  // dragenter/dragleave fire for every child element the pointer crosses, so
  // the highlight is driven by a depth counter rather than the last event.
  const depth = useRef(0);

  const accept = (list: FileList | null): void => {
    if (list === null || list.length === 0) return;
    setBusy(true);
    void uploadFiles(list, projectId, taskId).finally(() => {
      setBusy(false);
    });
  };

  const browse = (): void => {
    inputRef.current?.click();
  };

  return (
    <div
      className={`upload-drop ${over ? 'over' : ''} ${busy ? 'busy' : ''}`}
      data-testid="upload-dropzone"
      role="button"
      tabIndex={0}
      aria-label="Drop files here to upload"
      onClick={browse}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          browse();
        }
      }}
      onDragEnter={(e) => {
        e.preventDefault();
        depth.current += 1;
        setOver(true);
      }}
      onDragOver={(e) => {
        // Without this the browser opens the file instead of dropping it.
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
      }}
      onDragLeave={() => {
        depth.current = Math.max(0, depth.current - 1);
        if (depth.current === 0) setOver(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        depth.current = 0;
        setOver(false);
        accept(e.dataTransfer.files);
      }}
    >
      <input
        ref={inputRef}
        type="file"
        multiple
        aria-label="Choose files to upload"
        style={{ display: 'none' }}
        onClick={(e) => {
          // The picker's own click must not bubble back to the zone, which
          // would call click() again and re-open it.
          e.stopPropagation();
        }}
        onChange={(e) => {
          accept(e.target.files);
          e.target.value = '';
        }}
      />
      <span className="upload-drop-icon" aria-hidden="true">
        ⤓
      </span>
      <span className="upload-drop-text">
        {busy ? 'Uploading…' : over ? 'Release to upload' : 'Drop files here'}
      </span>
      {!busy && <span className="upload-drop-hint">or click to browse</span>}
    </div>
  );
}
