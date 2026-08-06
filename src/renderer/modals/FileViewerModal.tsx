import { parseCsv } from '@shared/domain/csv';
import { updateFile } from '@shared/domain/mutate';
import { blobUrl } from '@shared/ipc-contract';
import type { FileEntry } from '@shared/types';
import DOMPurify from 'dompurify';
import { Marked } from 'marked';
import { useEffect, useState } from 'react';

import { getApi } from '../app/api';
import { downloadFile, removeFileWithConfirm } from '../app/files';
import { useStore } from '../app/store';
import { FileTypeBadge } from '../components/FileRow';
import { PdfViewer } from '../components/PdfViewer';

const marked = new Marked({ gfm: true, breaks: true });

export function renderMarkdown(source: string): string {
  if (source.trim() === '') return '<p class="md-empty">Empty document.</p>';
  const html = marked.parse(source, { async: false });
  return DOMPurify.sanitize(html);
}

const IMAGE_EXTS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg']);

function CsvTable({ fileId }: { fileId: string }): React.JSX.Element {
  const [rows, setRows] = useState<string[][] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch(blobUrl(fileId))
      .then(async (r) => {
        if (!r.ok) throw new Error('not found');
        return r.text();
      })
      .then((text) => {
        if (alive) setRows(parseCsv(text).slice(0, 300));
      })
      .catch(() => {
        if (alive) setFailed(true);
      });
    return () => {
      alive = false;
    };
  }, [fileId]);

  if (failed) return <div className="card-empty">Could not read this CSV file.</div>;
  if (rows === null) return <div className="card-empty">Loading…</div>;
  return (
    <div className="scr csv-wrap" data-testid="csv-table">
      <table className="csv-table">
        <tbody>
          {rows.map((row, ri) => (
            <tr key={ri} className={ri === 0 ? 'head' : ''}>
              {row.map((cell, ci) =>
                ri === 0 ? <th key={ci}>{cell}</th> : <td key={ci}>{cell}</td>,
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Placeholder({ file, message }: { file: FileEntry; message: string }): React.JSX.Element {
  return (
    <div className="file-placeholder">
      <FileTypeBadge file={file} />
      <div className="file-placeholder-name">{file.name}</div>
      <p>{message}</p>
      {file.kind === 'file' && (
        <button
          className="btn primary"
          onClick={() => {
            downloadFile(file);
          }}
        >
          Download file
        </button>
      )}
    </div>
  );
}

/** The document viewer/editor overlay (prototype fileModal). */
export function FileViewerModal({ fileId }: { fileId: string }): React.JSX.Element | null {
  const { workspace, apply, closeModal, fileMode, setFileMode, modal } = useStore();
  const file = workspace?.files.find((f) => f.id === fileId);
  if (file === undefined) return null;

  const back = modal?.type === 'file' ? modal.back : undefined;
  const ext = (file.kind === 'markdown' ? 'md' : file.ext).toLowerCase();
  const isImage = IMAGE_EXTS.has(ext) || file.mime.startsWith('image/');
  const isPdf = ext === 'pdf' || file.mime === 'application/pdf';

  let body: React.JSX.Element;
  if (file.kind === 'markdown') {
    body =
      fileMode === 'edit' ? (
        <textarea
          className="inp md-editor"
          value={file.content}
          placeholder="Write markdown…"
          aria-label="Markdown source"
          onChange={(e) => {
            apply((ws) => updateFile(ws, file.id, { content: e.target.value }));
          }}
        />
      ) : (
        <div
          className="md-preview"
          data-testid="md-preview"
          onClick={(e) => {
            // Sanitized preview links open in the OS browser, never in-app.
            const anchor = (e.target as HTMLElement).closest('a');
            if (anchor !== null) {
              e.preventDefault();
              const href = anchor.getAttribute('href') ?? '';
              if (href.startsWith('http')) void getApi().openExternal(href);
            }
          }}
          dangerouslySetInnerHTML={{ __html: renderMarkdown(file.content) }}
        />
      );
  } else if (file.kind === 'ref') {
    body = (
      <Placeholder
        file={file}
        message="Reference entry — no file stored locally. Upload the actual file, or keep this as a pointer with a note."
      />
    );
  } else if (isImage) {
    body = (
      <div className="img-wrap">
        <img src={blobUrl(file.id)} alt={file.name} />
      </div>
    );
  } else if (isPdf) {
    body = (
      <PdfViewer
        source={{ url: blobUrl(file.id) }}
        label={file.name}
        fallback={
          <Placeholder file={file} message="This PDF could not be read — download to view it." />
        }
      />
    );
  } else if (ext === 'csv') {
    body = <CsvTable fileId={file.id} />;
  } else {
    body = (
      <Placeholder
        file={file}
        message={`Preview not available for .${ext.toUpperCase()} files. Download to open it in its native application.`}
      />
    );
  }

  return (
    <div className="overlay" onClick={closeModal} data-testid="file-modal-overlay">
      <div
        className="modal-panel file-modal scr"
        role="dialog"
        aria-label="File viewer"
        onClick={(e) => {
          e.stopPropagation();
        }}
      >
        <div className="modal-header file-header">
          <FileTypeBadge file={file} />
          {file.kind === 'markdown' ? (
            <input
              className="file-name-input"
              value={file.name}
              aria-label="File name"
              onChange={(e) => {
                apply((ws) => updateFile(ws, file.id, { name: e.target.value }));
              }}
            />
          ) : (
            <div className="file-name-static">{file.name}</div>
          )}
          <button
            className="btn ghost small"
            onClick={() => {
              downloadFile(file);
            }}
          >
            Download
          </button>
          <button
            className="btn danger small"
            onClick={() => {
              removeFileWithConfirm(file);
            }}
          >
            Delete
          </button>
          <button className="modal-close" aria-label="Close" onClick={closeModal}>
            ×
          </button>
        </div>
        <div className="file-body">
          {back !== undefined && (
            <button className="back-to-task" onClick={closeModal}>
              ‹ Back to task
            </button>
          )}
          {file.kind === 'markdown' && (
            <div className="file-mode-row">
              <div className="seg" role="tablist">
                <button
                  role="tab"
                  aria-selected={fileMode === 'preview'}
                  className={fileMode === 'preview' ? 'active' : ''}
                  onClick={() => {
                    setFileMode('preview');
                  }}
                >
                  Preview
                </button>
                <button
                  role="tab"
                  aria-selected={fileMode === 'edit'}
                  className={fileMode === 'edit' ? 'active' : ''}
                  onClick={() => {
                    setFileMode('edit');
                  }}
                >
                  Edit
                </button>
              </div>
            </div>
          )}
          {body}
        </div>
      </div>
    </div>
  );
}
