import type { FileEntry } from '@shared/types';

import { downloadFile, removeFileWithConfirm } from '../app/files';
import { useStore } from '../app/store';

/** File-type badge colors (design/README.md §File-type badge colors). */
const BADGE_COLORS: Record<string, string> = {
  md: 'var(--accent)',
  txt: 'var(--faint)',
  pdf: 'var(--danger-text)',
  csv: 'var(--ok-text)',
  xlsx: 'var(--ok-text)',
  docx: 'var(--status-doing-c)',
  rtf: 'var(--faint)',
  pptx: 'var(--warn-text)',
  png: 'var(--file-md)',
  jpg: 'var(--file-md)',
  jpeg: 'var(--file-md)',
  gif: 'var(--file-md)',
  webp: 'var(--file-md)',
};

export function humanSize(bytes: number): string {
  if (bytes <= 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1_048_576) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1_048_576).toFixed(1)} MB`;
}

export function FileTypeBadge({ file }: { file: FileEntry }): React.JSX.Element {
  const ext = (file.kind === 'markdown' ? 'md' : file.ext).toLowerCase();
  const color = BADGE_COLORS[ext] ?? 'var(--faint)';
  const label = file.kind === 'ref' && ext === '' ? 'REF' : (ext || '?').toUpperCase().slice(0, 4);
  return (
    <span className="file-badge" style={{ background: `${color}1c`, color }}>
      {label}
    </span>
  );
}

function kindLabel(file: FileEntry): string {
  if (file.kind === 'markdown') return 'Markdown';
  if (file.kind === 'ref') return 'Reference';
  return file.ext !== '' ? file.ext.toUpperCase() : 'File';
}

/** Library / attachment row (prototype _fileRow). */
export function FileRow({ file }: { file: FileEntry }): React.JSX.Element {
  const { workspace, openFile } = useStore();
  const owningTask =
    file.taskId !== null ? workspace?.tasks.find((t) => t.id === file.taskId) : undefined;

  return (
    <div
      className="trow file-row"
      role="button"
      tabIndex={0}
      onClick={() => {
        openFile(file.id);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') openFile(file.id);
      }}
      data-testid={`file-row-${file.id}`}
    >
      <FileTypeBadge file={file} />
      <div className="trow-body">
        <div className="trow-title">{file.name}</div>
        <div className="file-meta">
          <span>{kindLabel(file)}</span>
          {file.size > 0 && <span>{humanSize(file.size)}</span>}
          {owningTask !== undefined && (
            <span className="file-owner">· {owningTask.title.slice(0, 22)}</span>
          )}
        </div>
      </div>
      <button
        className="file-action"
        title="Download"
        onClick={(e) => {
          e.stopPropagation();
          downloadFile(file);
        }}
      >
        ↓
      </button>
      <button
        className="file-action"
        title="Delete"
        onClick={(e) => {
          e.stopPropagation();
          removeFileWithConfirm(file);
        }}
      >
        ×
      </button>
    </div>
  );
}
