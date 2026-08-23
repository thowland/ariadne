/**
 * Installs the Ariadne skill and MCP server for the local Claude (D39).
 *
 *   npm run install:skill            # link the skill, print the MCP config
 *   npm run install:skill -- --print # print only, change nothing
 *
 * The skill is symlinked rather than copied so that editing it in the repo is
 * immediately live, and so `git pull` updates it. The MCP registration is
 * printed rather than written: Claude's config files are the user's, and
 * silently editing them is not this script's business.
 */
import { existsSync, lstatSync, mkdirSync, readlinkSync, rmSync, symlinkSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const skillSource = join(root, 'skills', 'ariadne');
const serverPath = join(root, 'out', 'mcp', 'server.mjs');
const skillTarget = join(homedir(), '.claude', 'skills', 'ariadne');
const printOnly = process.argv.includes('--print');

function linkSkill() {
  if (printOnly) return 'not linked (--print)';
  mkdirSync(dirname(skillTarget), { recursive: true });
  if (existsSync(skillTarget) || lstatSync(skillTarget, { throwIfNoEntry: false })) {
    const link = lstatSync(skillTarget);
    if (!link.isSymbolicLink()) {
      return `left alone: ${skillTarget} exists and is not a symlink — move it aside first`;
    }
    if (readlinkSync(skillTarget) === skillSource) return `already linked → ${skillSource}`;
    rmSync(skillTarget);
  }
  symlinkSync(skillSource, skillTarget, 'dir');
  return `linked → ${skillSource}`;
}

const mcpConfig = {
  mcpServers: {
    ariadne: { command: 'node', args: [serverPath] },
  },
};

console.log(`Ariadne skill\n  ${linkSkill()}`);

if (!existsSync(serverPath)) {
  console.log(`\n⚠ The MCP server is not built yet. Run:\n    npm run build:mcp`);
}

console.log(`
MCP server (read-only)
  ${serverPath}

Register it with Claude Code, from anywhere:
    claude mcp add ariadne --scope user -- node ${serverPath}

Or add this to your Claude Desktop config
(~/Library/Application Support/Claude/claude_desktop_config.json on macOS):

${JSON.stringify(mcpConfig, null, 2)}

Check it by hand at any time:
    echo '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | node ${serverPath}
`);
