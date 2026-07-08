import { clearAll, replaceWorkspace, updateSettings } from '@shared/domain/mutate';
import { seedWorkspace } from '@shared/domain/seed';
import { mergeTodoistImport } from '@shared/domain/todoist';
import type { ImportResponse } from '@shared/ipc-contract';
import { TASK_PRIORITIES, TASK_STATUSES } from '@shared/types';
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
              <button className="btn ghost" onClick={changeDataDir}>
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
