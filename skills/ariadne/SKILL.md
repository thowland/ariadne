---
name: ariadne
description: Read a local Ariadne workspace — projects, tasks, contacts, what is overdue or due today, who is working on what, and how to reach them. Use when the user asks about their own work ("what's overdue", "what did I ask Dana for", "how's the migration going", "write my standup"), refers to a project or person by name, or wants a summary of their week. Read-only; it cannot change anything.
---

# Ariadne

Ariadne is the user's local project, task and contact tracker. Its data lives
on their own machine as JSON, and the `ariadne` MCP server exposes it
**read-only** through five tools.

## Getting your bearings

Call `ariadne_workspace_info` once at the start if you do not already know the
project names — every other tool takes a name, and having the real list stops
you guessing at one. It also confirms which workspace you are reading.

## Which tool answers which question

| The user asks                                                              | Call                   |
| -------------------------------------------------------------------------- | ---------------------- |
| "what should I be doing", "what's overdue", "write my standup"             | `ariadne_briefing`     |
| anything naming a thing you cannot resolve — "the varnish thing", "Dana"   | `ariadne_search` first |
| "how is <project> going", "what's left on <project>"                       | `ariadne_project`      |
| "what have I asked <person> for", "who is <person>", "how do I reach them" | `ariadne_contact`      |

`ariadne_briefing` takes an optional `scope` of `work` or `home`. Use it when
the user's question is clearly one or the other — a standup note for the office
should not list their tax return. Default to `all` otherwise.

## Reading what comes back

Every tool returns JSON. Some things worth knowing:

- **Dates are ISO** (`2026-07-08`) and mean the local day. `overdue: true` and
  `blocked: true` appear only when they apply — the app has already worked out
  which is which, so trust those flags rather than comparing dates yourself.
- **Effort estimates are effort, not calendar time.** `"2d 4h"` means twenty
  hours of work, whenever it happens. A day is eight hours. `"none estimated"`
  means nobody has estimated it, which is different from no work.
- **Status** is one of Todo, Doing, Waiting, Done, Dropped. Dropped means
  abandoned, not finished — never count it as progress.
- **`people`** on a task are the contacts linked to it. That is usually who the
  work was delegated to or who asked for it.
- **Work and Home** are the user's two halves. Never mix them in one summary
  unless asked; a work status note that mentions a personal project is a real
  problem, not a cosmetic one.

## Writing a standup or a status note

Lead with what is overdue, then what is due today, then what is blocked and on
what. Name the project for each task — the titles alone are ambiguous out of
context. Keep it to what actually moved or is at risk; the user can read a full
list themselves.

## What this cannot do

It is read-only. There is no tool to create, edit, complete or delete
anything, and there will not be one in this version. If the user asks you to
change something, tell them what to change and where — "mark _Migrate auth
service_ done in Q3 Platform Migration" — rather than implying you did it.

It also reads the last state saved to disk. The app flushes about a second
after an edit, so something typed a moment ago may not be there yet; if a
result looks stale, say so and try once more rather than telling the user
their data is wrong.

Settings are never exposed, deliberately: that file holds API tokens.
