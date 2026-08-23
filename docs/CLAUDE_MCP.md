# Asking Claude about your workspace

Ariadne can hand a local Claude a **read-only** view of your projects, tasks
and contacts, so you can ask things like:

> what's overdue?
> what have I asked Dana for?
> how is the Q3 migration going — what's left?
> write my standup for this morning
> who at Northwind am I dealing with, and how do I reach them?

It answers from your actual workspace instead of guessing. This guide covers
setting it up in **Claude Code** and **Claude Desktop**, what it can and
cannot do, and what to check when it misbehaves.

---

## What it is

A small program — `out/mcp/server.mjs` — that speaks
[Model Context Protocol](https://modelcontextprotocol.io) over its standard
input and output. Claude starts it when it needs an answer and stops it
afterwards.

- **Nothing listens on a port.** There is no daemon and no socket. Other
  programs on your machine cannot reach it; only a process that launches it
  can talk to it.
- **Nothing goes to the network.** It reads the same JSON files the app reads,
  from the same folder.
- **It cannot change anything.** See [What it will not do](#what-it-will-not-do).
- **Ariadne does not have to be running.** It reads the files on disk, so it
  works whether the app is open or closed.

## Setting it up

### 1. Build it

From your Ariadne checkout:

```sh
npm install
npm run build
```

`npm run build` produces `out/mcp/server.mjs` along with the app. If you only
want the server, `npm run build:mcp` is enough and takes about a second.

### 2. Register it

```sh
npm run install:skill
```

This links the skill into `~/.claude/skills/ariadne` and prints the exact
command to register the server, with the right absolute path already filled
in. Add `-- --print` to see what it would do without changing anything.

#### Claude Code

Run the command it printed:

```sh
claude mcp add ariadne --scope user -- node /path/to/ariadne/out/mcp/server.mjs
```

`--scope user` makes it available in every Claude Code session on your
machine, which is the point — you want to ask about your work while you are
working on something else. Use `--scope project` instead if you only want it
inside one repository.

Check it:

```sh
claude mcp list
```

The **skill** is what teaches Claude _when_ to reach for these tools and how
to read the results — which tool answers which kind of question, that Work
and Home must never be mixed in one summary, that an estimate is effort
rather than calendar time. `npm run install:skill` symlinks it rather than
copying, so editing `skills/ariadne/SKILL.md` in the repo takes effect
immediately and `git pull` keeps it current.

#### Claude Desktop

Claude Desktop reads its MCP servers from a JSON file:

| Platform | File                                                              |
| -------- | ----------------------------------------------------------------- |
| macOS    | `~/Library/Application Support/Claude/claude_desktop_config.json` |
| Windows  | `%APPDATA%\Claude\claude_desktop_config.json`                     |
| Linux    | `~/.config/Claude/claude_desktop_config.json`                     |

Add the server (keep any `mcpServers` entries already there):

```json
{
  "mcpServers": {
    "ariadne": {
      "command": "node",
      "args": ["/path/to/ariadne/out/mcp/server.mjs"]
    }
  }
}
```

Use the absolute path `npm run install:skill` printed — a relative path will
not resolve, because Claude Desktop does not start in your checkout. Restart
Claude Desktop afterwards; the tools appear in the tools menu.

The `SKILL.md` file is a Claude Code convention and Desktop will not pick it
up from `~/.claude/skills`. The tools describe themselves well enough to be
useful on their own; if you want the same steering in Desktop, paste the body
of `skills/ariadne/SKILL.md` into a Project's custom instructions.

## What you get

Five tools. You never call them by name — you ask a question and Claude picks.

| Tool                     | Answers                                                                                                                                   |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `ariadne_briefing`       | What needs attention: overdue, due today, due this week, blocked, with counts and remaining effort. Optional `scope` of `work` or `home`. |
| `ariadne_search`         | One query across tasks, projects, contacts and tags. How a vague reference becomes a real record.                                         |
| `ariadne_project`        | One project in full: tasks, effort, dependencies, people, notes, links, file names.                                                       |
| `ariadne_contact`        | One person: how to reach them, who they report to and who reports to them, every task and project of theirs.                              |
| `ariadne_workspace_info` | Where it is reading from, how much is there, and the list of project names.                                                               |

Worth knowing about the answers:

- **Dates are ISO** and mean the local day. `overdue` and `blocked` come back
  as flags — the app has already worked out which is which, so Claude does not
  re-derive them and cannot disagree with your screen.
- **Effort is effort, not calendar time.** `"2d 4h"` means twenty hours of
  work whenever it happens; a day is eight hours.
- **Work and Home stay separate** when you ask for one. A standup note for the
  office will not mention your tax return.

## What it will not do

**It cannot create, edit, complete or delete anything.** There is no tool
that writes, and this is structural rather than a promise: nothing in the
server's source can reach Ariadne's mutation layer, and a test fails the build
if a tool is ever named like a write. Ask Claude to change something and it
will tell you what to change and where, not do it.

That is a deliberate limit, not an oversight. Ariadne keeps your workspace in
memory while it is open and rewrites the JSON files on its next save, so
anything editing those files behind the running app's back would be silently
overwritten. Safe writing needs the app to notice changes made underneath it
first — a separate piece of work.

**It never reads your settings.** `settings.json` holds your Todoist token and
Anthropic API key in plain text, and the server does not open that file at
all. Its own tests plant a fake secret there and check it never appears in
anything the server emits.

**It reads the last saved state.** Ariadne writes about a second after you
stop typing, so something you changed a moment ago may not be there yet. Ask
again.

## Checking and fixing

Talk to it yourself — it is just a program on a pipe:

```sh
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | node out/mcp/server.mjs
```

You should get one line of JSON listing five tools, and a line on stderr
saying which folder it is reading.

**"no Ariadne workspace found"** — it looks where Electron puts application
data, then reads Ariadne's own `config.json` to find where you actually keep
your workspace. If you have never launched the app on this machine, or you
keep the data somewhere unusual, point it straight at the folder holding
`projects.json`:

```sh
ARIADNE_DATA_DIR=/path/to/your/data node out/mcp/server.mjs
```

To make that permanent, add it to the registration:

```json
{
  "mcpServers": {
    "ariadne": {
      "command": "node",
      "args": ["/path/to/ariadne/out/mcp/server.mjs"],
      "env": { "ARIADNE_DATA_DIR": "/path/to/your/data" }
    }
  }
}
```

**Claude says the tools are unavailable** — check the path in your
registration is absolute and that the file exists. After a `git pull`, run
`npm run build:mcp` again: the bundle is build output and is not committed.

**The answers look out of date** — the server reads from disk on every call,
so this is almost always the save debounce described above. If it persists,
run `ariadne_workspace_info` (ask "which workspace are you reading?") and
check the folder it names is the one you expect.

**It is reading the wrong workspace** — that happens if you have both a
packaged Ariadne and a `npm run dev` checkout, each with their own application
data folder. `ARIADNE_DATA_DIR` settles it.

## For the curious

The server is one file with no runtime dependencies: everything it needs is
bundled at build time, so it will run wherever `node` will. It shares
Ariadne's own validation schemas and derivation logic rather than
reimplementing them, which is why "overdue" means exactly the same thing to
Claude as it does on your Command Center.

The protocol is implemented by hand rather than with the official SDK —
`docs/TECHNICAL_SPEC.md` decision **D39** explains why, along with the rest of
the design. The source is `src/mcp/`.
