import { clearAll, replaceWorkspace, updateSettings } from '@shared/domain/mutate';
import { seedWorkspace } from '@shared/domain/seed';
import { collectTodoistPushCandidates, markTasksPushed } from '@shared/domain/todoist';
import type { ImportResponse } from '@shared/ipc-contract';
import type { BadgeMode, TodoistSyncEvery, ThemeChoice } from '@shared/types';
import { BACKUP_KEEP_MAX, TASK_PRIORITIES, TASK_STATUSES } from '@shared/types';
import { useEffect, useState } from 'react';

import { getApi } from '../app/api';
import { useStore } from '../app/store';
import { finishJsonImport, runArchiveExport, runArchiveImport } from '../app/workspace-io';
import { Card, Dot, Pill } from '../components/primitives';
import { PRIORITY_COLORS, STATUS_COLORS } from '../styles/colors';

/** Settings: data management, integrations, reference (prototype viewSettings, minus Account — no auth). */
export function Settings(): React.JSX.Element {
  const {
    workspace,
    today,
    apply,
    askConfirm,
    showToast,
    openAiImport,
    runTodoistSync,
    todoistSyncing,
  } = useStore();
  const [dataDir, setDataDir] = useState('…');
  const [defaultLogDir, setDefaultLogDir] = useState('…');
  const [importText, setImportText] = useState('');

  useEffect(() => {
    void getApi()
      .getDataDir()
      .then((res) => {
        setDataDir(res.path);
      });
    void getApi()
      .getLogInfo()
      .then((res) => {
        setDefaultLogDir(res.defaultDir);
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
    if (finishJsonImport(res)) setImportText('');
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
      })
      .catch(() => {
        showToast('Todoist push failed unexpectedly — try again');
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

  const chooseLogDir = (): void => {
    void getApi()
      .chooseLogDir()
      .then((res) => {
        if (res.path !== null) {
          apply((ws2) => updateSettings(ws2, { debugLogDir: res.path }));
          showToast('Log folder updated');
        }
      });
  };

  const revealLogFile = (): void => {
    void getApi()
      .revealLogFile()
      .then((res) => {
        if (!res.ok) showToast(res.error ?? 'No log file yet');
      });
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
              Everything lives on this computer as plain JSON plus your uploaded files. An{' '}
              <strong>archive</strong> is a single .zip holding the workspace and every uploaded
              file — that is the one to keep, and the one to carry to a new machine. The JSON export
              inlines file bytes as base64 (much larger) and stays for compatibility with older
              exports.
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
              <button
                className="btn primary"
                onClick={() => {
                  void runArchiveExport();
                }}
              >
                Export archive…
              </button>
              <button
                className="btn ghost"
                onClick={() => {
                  void runArchiveImport();
                }}
              >
                Import archive…
              </button>
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
              Store your Todoist API token to connect the two apps. Push sends upcoming tasks to
              Todoist; the completion sync then watches the tasks you’ve sent and, when you complete
              one in Todoist, marks it Done here with Todoist’s completion date. The sync never
              creates or deletes anything.
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
              <button
                className="btn primary"
                disabled={todoistSyncing}
                onClick={() => void runTodoistSync()}
              >
                {todoistSyncing ? 'Syncing…' : 'Sync now'}
              </button>
            </div>
            <div>
              <div className="field-label">CHECK FOR COMPLETED TASKS</div>
              <span className="settings-copy">
                <select
                  className="inp select"
                  value={workspace?.settings.todoistSyncEvery ?? 'manual'}
                  aria-label="Todoist sync schedule"
                  onChange={(e) => {
                    apply((ws2) =>
                      updateSettings(ws2, {
                        todoistSyncEvery: e.target.value as TodoistSyncEvery,
                      }),
                    );
                  }}
                >
                  <option value="manual">Only when I click Sync now</option>
                  <option value="hourly">Every hour</option>
                  <option value="daily">Once a day</option>
                </select>{' '}
                — looks at the last 30 days of Todoist completions
              </span>
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
            {workspace?.settings.lastTodoistSyncAt !== null &&
              workspace?.settings.lastTodoistSyncAt !== undefined && (
                <p className="settings-copy" data-testid="todoist-last-sync">
                  Last sync: {new Date(workspace.settings.lastTodoistSyncAt).toLocaleString()}
                </p>
              )}
          </div>
        </Card>

        <Card title="Integrations · Claude AI">
          <div className="card-pad settings-section">
            <p className="settings-copy">
              Store an Anthropic API key to enable AI task import: paste any text (meeting notes,
              emails) and Claude extracts the action items for you to review, one by one. The key is
              kept in plain text in your local settings file, like the Todoist token.
            </p>
            <div className="todoist-row">
              <div className="todoist-token">
                <div className="field-label">ANTHROPIC API KEY</div>
                <input
                  className="inp full"
                  type="password"
                  value={workspace?.settings.anthropicApiKey ?? ''}
                  placeholder="sk-ant-…"
                  aria-label="Anthropic API key"
                  onChange={(e) => {
                    apply((ws2) => updateSettings(ws2, { anthropicApiKey: e.target.value }));
                  }}
                />
              </div>
              <button className="btn primary" onClick={openAiImport}>
                Import tasks…
              </button>
            </div>
            <p className="settings-copy">
              Create a key at console.anthropic.com → API keys. Extraction uses Claude Sonnet; the
              pasted text is sent to Anthropic for that one request and nothing else leaves your
              machine.
            </p>
          </div>
        </Card>

        <Card title="Dock badge">
          <div className="card-pad settings-section">
            <p className="settings-copy">
              Show a count on Ariadne&rsquo;s dock icon so you can see what is waiting without
              switching to the app. Counts across every active project, whichever Work/Home filter
              the window happens to be showing.
            </p>
            <label className="field-label" htmlFor="badge-mode">
              BADGE
            </label>
            <select
              id="badge-mode"
              className="select"
              value={workspace?.settings.badgeMode ?? 'none'}
              aria-label="Dock badge"
              onChange={(e) => {
                apply((ws2) => updateSettings(ws2, { badgeMode: e.target.value as BadgeMode }));
              }}
            >
              <option value="none">No badge</option>
              <option value="due">Tasks due today</option>
              <option value="overdue">Overdue tasks</option>
            </select>
            <p className="settings-copy muted">
              macOS shows this on the dock icon; Linux needs a Unity-style launcher. Windows has no
              equivalent badge, so the setting has no effect there.
            </p>
          </div>
        </Card>

        <Card title="Appearance">
          <div className="card-pad settings-section">
            <p className="settings-copy">
              Ariadne follows your operating system’s light or dark setting by default, switching
              when it does. Pin it here if you would rather it stayed put.
            </p>
            <select
              className="inp select"
              value={workspace?.settings.theme ?? 'system'}
              aria-label="Theme"
              onChange={(e) => {
                apply((ws2) => updateSettings(ws2, { theme: e.target.value as ThemeChoice }));
              }}
            >
              <option value="system">Match the system</option>
              <option value="light">Always light</option>
              <option value="dark">Always dark</option>
            </select>
            <p className="settings-copy muted">
              Printed and exported reports stay on white paper whichever you pick.
            </p>
          </div>
        </Card>

        <Card title="Debug logging">
          <div className="card-pad settings-section">
            <p className="settings-copy">
              When something misbehaves, turn this on: Ariadne records its activity — your edits and
              navigation, backups, Todoist sync attempts, disk saves, imports — to a plain-text log
              file you can read or send along with a bug report. Nothing leaves your machine.
            </p>
            <label className="settings-copy">
              <input
                type="checkbox"
                checked={workspace?.settings.debugLogging ?? false}
                aria-label="Enable debug logging"
                onChange={(e) => {
                  apply((ws2) => updateSettings(ws2, { debugLogging: e.target.checked }));
                }}
              />{' '}
              Enable debug logging
            </label>
            <div className="data-dir-row">
              <div>
                <div className="field-label">LOG FOLDER</div>
                <code className="data-dir-path" data-testid="log-dir">
                  {workspace?.settings.debugLogDir ?? `${defaultLogDir} (default)`}
                </code>
              </div>
              <div className="settings-actions">
                {workspace?.settings.debugLogDir !== null && (
                  <button
                    className="btn subtle"
                    onClick={() => {
                      apply((ws2) => updateSettings(ws2, { debugLogDir: null }));
                    }}
                  >
                    Use default
                  </button>
                )}
                <button className="btn ghost" aria-label="Change log folder" onClick={chooseLogDir}>
                  Change…
                </button>
                <button className="btn ghost" onClick={revealLogFile}>
                  Show log file
                </button>
              </div>
            </div>
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
