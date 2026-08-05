import type { MenuCommand } from '@shared/ipc-contract';

import { getApi } from './api';
import { useStore } from './store';
import {
  runArchiveExport,
  runArchiveImport,
  runBackupNow,
  runJsonExport,
  runJsonImportFile,
} from './workspace-io';

/**
 * Dispatch for application-menu commands pushed from the main process. Every
 * branch delegates to an action the UI already has, so a menu item and its
 * on-screen button can never drift apart.
 */
export function runMenuCommand(command: MenuCommand): void {
  const s = useStore.getState();
  if (s.workspace?.settings.debugLogging === true)
    getApi().logEvent('activity', `menu: ${command}`);
  switch (command) {
    case 'about':
      s.openAbout();
      return;
    case 'help':
      s.openHelp();
      return;
    case 'shortcuts':
      s.openHelp('shortcuts');
      return;
    case 'newProject':
      s.newProject();
      return;
    case 'newTask':
      s.newTaskGlobal();
      return;
    case 'aiImport':
      s.openAiImport();
      return;
    case 'exportArchive':
      void runArchiveExport();
      return;
    case 'importArchive':
      void runArchiveImport();
      return;
    case 'exportJson':
      void runJsonExport();
      return;
    case 'importJson':
      void runJsonImportFile();
      return;
    case 'backupNow':
      void runBackupNow();
      return;
    case 'todoistSync':
      void s.runTodoistSync();
      return;
    case 'search':
      // The search box owns the query; focusing it is the whole action.
      document.querySelector<HTMLInputElement>('.search-input')?.focus();
      return;
    case 'goHome':
      s.go('home');
      return;
    case 'goCalendar':
      s.go('calendar');
      return;
    case 'goReports':
      s.go('reports');
      return;
    case 'goFiles':
      s.go('files');
      return;
    case 'goTags':
      s.go('tags');
      return;
    case 'goSettings':
      s.go('settings');
      return;
    case 'scopeAll':
      s.setScope('all');
      return;
    case 'scopeWork':
      s.setScope('work');
      return;
    case 'scopeHome':
      s.setScope('home');
      return;
  }
}
