import { homedir } from 'node:os';
import { createInterface } from 'node:readline';

import { todayIso } from '@shared/domain/clock';

import { locateDataDir } from './locate';
import { handleLine } from './protocol';
import type { ToolContext } from './protocol';
import { readWorkspace } from './workspace';

/**
 * Entry point for the read-only MCP server (D39).
 *
 * Two rules govern this file. Nothing may ever be written — no import here
 * reaches a mutation or `StorageService`. And **nothing may print to stdout
 * except JSON-RPC**: stdout is the protocol channel, so a stray console.log
 * corrupts the stream and the client drops the connection. Diagnostics go to
 * stderr, which the client shows in its logs.
 */

function main(): void {
  const located = locateDataDir(process.platform, homedir(), process.env);
  if (located === null) {
    process.stderr.write(
      'ariadne-mcp: no Ariadne workspace found. Launch Ariadne once, or set ' +
        'ARIADNE_DATA_DIR to the folder holding projects.json.\n',
    );
    process.exit(1);
  }

  const ctx: ToolContext = {
    readWorkspace: () => readWorkspace(located.dataDir),
    // ARIADNE_FAKE_TODAY keeps the server pinnable the same way the app is.
    today: () => todayIso(process.env.ARIADNE_FAKE_TODAY),
    dataDir: located.dataDir,
    locatedVia: located.via,
  };

  process.stderr.write(`ariadne-mcp: read-only on ${located.dataDir} (${located.via})\n`);

  const lines = createInterface({ input: process.stdin });
  lines.on('line', (line) => {
    if (line.trim() === '') return;
    const response = handleLine(line, ctx);
    if (response !== null) process.stdout.write(`${JSON.stringify(response)}\n`);
  });
  lines.on('close', () => {
    process.exit(0);
  });
}

main();
