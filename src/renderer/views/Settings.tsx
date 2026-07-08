import { clearAll, replaceWorkspace, updateSettings } from '@shared/domain/mutate';
import { seedWorkspace } from '@shared/domain/seed';
import { deleteTag, renameTag, tagUsage } from '@shared/domain/tags';
import {
  collectTodoistPushCandidates,
  markTasksPushed,
  mergeTodoistImport,
} from '@shared/domain/todoist';
import type { ImportResponse } from '@shared/ipc-contract';
import { BACKUP_KEEP_MAX, TASK_PRIORITIES, TASK_STATUSES } from '@shared/types';
import { useEffect, useState } from 'react';

import { getApi } from '../app/api';
import { useStore } from '../app/store';
import { Card, Dot, Pill } from '../components/primitives';
import { PRIORITY_COLORS, STATUS_COLORS } from '../styles/colors';

/** Settings: data management, integrations, reference (prototype viewSettings, minus Account — no auth). */
export function Settings(): React.JSX.Element {
  const { workspace, today, apply, askConfirm, showToast, go } = useStore();
  const [dataDir, setDataDir] = useState('…');
  const [importText, setImportText] = useState('');
  const [renaming, setRenaming] = useState<{ tag: string; value: string } | null>(null);

  useEffect(() => {
    void getApi()
      .getDataDir()
      .then((res) => {
        setDataDir(res.path);
      });
  }, []);

  const runExport = (): void => {
    void getApi()
      .exportWorkspace()
      .then((res) => {
        if (res.error !== undefined) showToast(res.error);
        else if (res.savedPath !== null) showToast('Exported JSON backup');
      });
  };

  const finishImport = (res: ImportResponse): void => {
    if (!res.ok) {
      if (res.cancelled !== true) showToast(res.error);
      return;
    }
    apply(() => replaceWorkspace(res.workspace));
    setImportText('');
    go('home');
    showToast(
      `Imported ${res.workspace.projects.length} projects, ${res.workspace.tasks.length} tasks`,
    );
  };

  const importFile = (): void => {
    void getApi().importFromFile().then(finishImport);
  };

  const importPasted = (): void => {
    if (importText.trim() === '') {
      showToast('Nothing to import');
      return;
    }
    void getApi().importFromText(importText).then(finishImport);
  };

  const resetToSample = (): void => {
    void askConfirm('Replace everything with the sample dataset?').then((ok) => {
      if (!ok) return;
      const oldBlobIds = workspace?.files.filter((f) => f.kind === 'file').map((f) => f.id) ?? [];
      if (oldBlobIds.length > 0) void getApi().deleteBlobs(oldBlobIds);
      apply(() => replaceWorkspace(seedWorkspace(today)));
      showToast('Reset to sample data');
    });
  };

  const clearEverything = (): void => {
    void askConfirm('Delete ALL projects and tasks?').then((ok) => {
      if (!ok) return;
      const result = apply((ws) => clearAll(ws));
      if (result !== null && result.removedBlobIds.length > 0) {
        void getApi().deleteBlobs(result.removedBlobIds);
      }
      showToast('All data cleared');
    });
  };

  const pushDays = workspace?.settings.todoistPushDays ?? 7;
  const pushCandidates =
    workspace !== null ? collectTodoistPushCandidates(workspace, today, pushDays) : [];

  const setPushDays = (value: string): void => {
    const n = Number(value);
    if (!Number.isFinite(n)) return;
    const clamped = Math.min(60, Math.max(1, Math.round(n)));
    apply((ws2) => updateSettings(ws2, { todoistPushDays: clamped }));
  };

  const runTodoistPush = (): void => {
    const token = workspace?.settings.todoistToken ?? '';
    if (pushCandidates.length === 0) {
      showToast(`Nothing to push — no unsent tasks due in the next ${pushDays} days`);
      return;
    }
    void getApi()
      .todoistPush(token, pushCandidates)
      .then((res) => {
        if (!res.ok) {
          showToast(res.error);
          return;
        }
        if (res.pushed.length > 0) apply((ws2) => markTasksPushed(ws2, res.pushed));
        showToast(
          res.failed > 0
            ? `Pushed ${res.pushed.length} of ${res.pushed.length + res.failed} tasks to Todoist`
            : `Pushed ${res.pushed.length} task${res.pushed.length === 1 ? '' : 's'} to Todoist`,
        );
      });
  };

  const runTodoistImport = (): void => {
    const token = workspace?.settings.todoistToken ?? '';
    void getApi()
      .todoistFetch(token)
      .then((res) => {
        if (!res.ok) {
          showToast(res.error);
          return;
        }
        const result = apply((ws2, ctx) => mergeTodoistImport(ws2, ctx, res.items));
        if (result === null) return;
        apply((ws2) => updateSettings(ws2, { lastTodoistImportAt: new Date().toISOString() }));
        showToast(
          result.added > 0 || result.updated > 0
            ? `Imported ${result.added} task${result.added === 1 ? '' : 's'} from Todoist` +
                (result.updated > 0 ? ` (${result.updated} updated)` : '')
            : 'Todoist is already in sync',
        );
      });
  };

  const tags = workspace !== null ? tagUsage(workspace) : [];

  const commitRename = (): void => {
    if (renaming === null) return;
    const from = renaming.tag;
    const to = renaming.value.trim().replace(/^#/, '');
    setRenaming(null);
    if (to === '' || to.toLowerCase() === from.toLowerCase()) return;
    const mergesInto = tags.some((u) => u.tag.toLowerCase() === to.toLowerCase());
    const doIt = (): void => {
      apply((ws2) => renameTag(ws2, from, to));
      showToast(mergesInto ? `Merged #${from} into #${to}` : `Renamed #${from} to #${to}`);
    };
    if (mergesInto) {
      void askConfirm(`Merge #${from} into existing tag #${to}?`).then((ok) => {
        if (ok) doIt();
      });
    } else {
      doIt();
    }
  };

  const removeTag = (tag: string, uses: number): void => {
    void askConfirm(`Remove #${tag} from ${uses} item${uses === 1 ? '' : 's'}?`).then((ok) => {
      if (!ok) return;
      apply((ws2) => deleteTag(ws2, tag));
      showToast(`Deleted #${tag}`);
    });
  };

  const runBackupNow = (): void => {
    void getApi()
      .runBackupNow()
      .then((res) => {
        showToast(
          res.ok ? `Backed up to ${res.path ?? 'backup folder'}` : (res.error ?? 'Backup failed'),
        );
      });
  };

  const chooseBackupDir = (): void => {
    void getApi()
      .chooseBackupDir()
      .then((res) => {
        if (res.path !== null) {
          apply((ws2) => updateSettings(ws2, { backupDir: res.path }));
          showToast('Backup folder updated');
        }
      });
  };

  const setBackupKeep = (value: string): void => {
    const n = Number(value);
    if (!Number.isFinite(n)) return;
    const clamped = Math.min(BACKUP_KEEP_MAX, Math.max(1, Math.round(n)));
    apply((ws2) => updateSettings(ws2, { backupKeep: clamped }));
  };

  const changeDataDir = (): void => {
    void getApi()
      .chooseDataDir()
      .then((res) => {
        if (res.mode === 'unchanged') return;
        setDataDir(res.path);
        showToast(
          res.mode === 'migrated'
            ? 'Data migrated — restarting Ariadne…'
            : 'Loading workspace from the new folder — restarting…',
        );
      });
  };

  return (
    <div className="view-wrap fadein" style={{ maxWidth: 720 }}>
      <div className="settings-stack">
        <Card title="Data">
          <div className="card-pad settings-section">
            <p className="settings-copy">
              Everything lives on this computer as plain JSON plus your uploaded files. Export a
              backup any time, or import to restore / move machines.
            </p>
            <div className="data-dir-row">
              <div>
                <div className="field-label">DATA FOLDER</div>
                <code className="data-dir-path" data-testid="data-dir">
                  {dataDir}
                </code>
              </div>
              <button className="btn ghost" aria-label="Change data folder" onClick={changeDataDir}>
                Change…
              </button>
            </div>
            <div className="settings-actions">
              <button className="btn ghost" onClick={runExport}>
                Export JSON
              </button>
              <button className="btn ghost" onClick={importFile}>
                Import file…
              </button>
              <button className="btn ghost" onClick={resetToSample}>
                Reset to sample data
              </button>
              <button className="btn danger" onClick={clearEverything}>
                Clear all
              </button>
            </div>
            <div>
              <div className="field-label">IMPORT FROM PASTED JSON</div>
              <textarea
                className="inp import-area"
                value={importText}
                placeholder="Paste exported JSON here…"
                onChange={(e) => {
                  setImportText(e.target.value);
                }}
              />
              <button className="btn ghost" onClick={importPasted}>
                Apply pasted JSON
              </button>
            </div>
          </div>
        </Card>

        <Card title="Tags" count={tags.length}>
          <div className="card-pad settings-section">
            <p className="settings-copy">
              Every tag in use across projects and tasks. Rename to clean up variants — renaming
              onto an existing tag merges them — or delete a tag everywhere.
            </p>
            {tags.length > 0 ? (
              <div className="tag-manage-list" data-testid="tag-manage-list">
                {tags.map((u) => (
                  <div key={u.tag} className="tag-manage-row">
                    {renaming?.tag === u.tag ? (
                      <input
                        className="inp tag-rename-input"
                        value={renaming.value}
                        aria-label={`New name for ${u.tag}`}
                        autoFocus
                        onChange={(e) => {
                          setRenaming({ tag: u.tag, value: e.target.value });
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') commitRename();
                          if (e.key === 'Escape') setRenaming(null);
                        }}
                        onBlur={commitRename}
                      />
                    ) : (
                      <span className="tag-chip tag-manage-chip">#{u.tag}</span>
                    )}
                    <span className="tag-manage-counts">
                      {u.projects > 0 && `${u.projects} project${u.projects === 1 ? '' : 's'}`}
                      {u.projects > 0 && u.tasks > 0 && ' · '}
                      {u.tasks > 0 && `${u.tasks} task${u.tasks === 1 ? '' : 's'}`}
                    </span>
                    <div className="spacer" />
                    <button
                      className="btn subtle"
                      onClick={() => {
                        setRenaming({ tag: u.tag, value: u.tag });
                      }}
                    >
                      Rename…
                    </button>
                    <button
                      className="btn subtle tag-delete"
                      aria-label={`Delete tag ${u.tag}`}
                      onClick={() => {
                        removeTag(u.tag, u.projects + u.tasks);
                      }}
                    >
                      Delete
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="card-empty">No tags yet.</div>
            )}
          </div>
        </Card>

        <Card title="Backups">
          <div className="card-pad settings-section">
            <p className="settings-copy">
              Ariadne copies your workspace — the JSON documents and every uploaded file — into a
              dated folder once a day and again when you quit. Each day&apos;s backup lives in a
              folder named by its ISO date (e.g. 2026-07-08).
            </p>
            <div className="data-dir-row">
              <div>
                <div className="field-label">BACKUP FOLDER</div>
                <code className="data-dir-path" data-testid="backup-dir">
                  {workspace?.settings.backupDir ?? `${dataDir}/backups (default)`}
                </code>
              </div>
              <div className="settings-actions">
                {workspace?.settings.backupDir !== null && (
                  <button
                    className="btn subtle"
                    onClick={() => {
                      apply((ws2) => updateSettings(ws2, { backupDir: null }));
                    }}
                  >
                    Use default
                  </button>
                )}
                <button
                  className="btn ghost"
                  aria-label="Change backup folder"
                  onClick={chooseBackupDir}
                >
                  Change…
                </button>
              </div>
            </div>
            <div className="backup-keep-row">
              <div>
                <div className="field-label">DAYS TO KEEP</div>
                <input
                  type="number"
                  className="inp backup-keep-input"
                  min={1}
                  max={BACKUP_KEEP_MAX}
                  value={workspace?.settings.backupKeep ?? 10}
                  aria-label="Backups to keep"
                  onChange={(e) => {
                    setBackupKeep(e.target.value);
                  }}
                />
                <span className="settings-copy backup-keep-hint">
                  daily backups (1–{BACKUP_KEEP_MAX}); older ones are deleted automatically
                </span>
              </div>
              <button className="btn ghost" onClick={runBackupNow}>
                Back up now
              </button>
            </div>
          </div>
        </Card>

        <Card title="Integrations · Todoist">
          <div className="card-pad settings-section">
            <p className="settings-copy">
              Store your Todoist API token to import tasks captured on your phone. Import is one-way
              (Todoist → Ariadne) into a “Todoist Inbox” project; re-importing updates due dates and
              priorities of open tasks and never deletes anything.
            </p>
            <div className="todoist-row">
              <div className="todoist-token">
                <div className="field-label">TODOIST API TOKEN</div>
                <input
                  className="inp full"
                  type="password"
                  value={workspace?.settings.todoistToken ?? ''}
                  placeholder="0123abcd…"
                  aria-label="Todoist API token"
                  onChange={(e) => {
                    apply((ws2) => updateSettings(ws2, { todoistToken: e.target.value }));
                  }}
                />
              </div>
              <button className="btn primary" onClick={runTodoistImport}>
                Import now
              </button>
            </div>
            <div className="push-row">
              <div>
                <div className="field-label">PUSH UPCOMING TASKS</div>
                <span className="settings-copy">
                  tasks due in the next{' '}
                  <input
                    type="number"
                    className="inp push-days-input"
                    min={1}
                    max={60}
                    value={pushDays}
                    aria-label="Push window in days"
                    onChange={(e) => {
                      setPushDays(e.target.value);
                    }}
                  />{' '}
                  days → Todoist #Home / #Work with an @project-name label
                </span>
                <div className="push-preview" data-testid="push-preview">
                  {pushCandidates.length} task{pushCandidates.length === 1 ? '' : 's'} ready to push
                </div>
              </div>
              <button className="btn ghost" onClick={runTodoistPush}>
                Push to Todoist
              </button>
            </div>
            {workspace?.settings.lastTodoistImportAt !== null &&
              workspace?.settings.lastTodoistImportAt !== undefined && (
                <p className="settings-copy" data-testid="todoist-last-import">
                  Last import: {new Date(workspace.settings.lastTodoistImportAt).toLocaleString()}
                </p>
              )}
          </div>
        </Card>

        <Card title="Status & priority reference">
          <div className="card-pad settings-section">
            <div className="legend-row">
              <span className="legend-label">STATUS</span>
              {TASK_STATUSES.map((s) => (
                <Pill key={s} text={s} c={STATUS_COLORS[s].c} bg={STATUS_COLORS[s].bg} />
              ))}
            </div>
            <div className="legend-row">
              <span className="legend-label">PRIORITY</span>
              {TASK_PRIORITIES.map((p) => (
                <span key={p} className="legend-prio" style={{ color: PRIORITY_COLORS[p].c }}>
                  <Dot color={PRIORITY_COLORS[p].dot} size={8} />
                  {p}
                </span>
              ))}
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
