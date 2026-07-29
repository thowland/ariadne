# Security

## What Ariadne's threat model actually is

Ariadne is a single-user desktop application that stores everything in plain
files in your own user directory. It has no server, no authentication, and no
multi-user boundary, so anyone who can read your home directory can read your
Ariadne data. That is the intended design rather than an oversight, and it means
the operating system's own account separation and disk encryption are what
protect your data.

Two things are worth knowing explicitly:

- **API credentials are stored in plain text** in `settings.json` inside the data
  directory. This is decision D10 in `docs/TECHNICAL_SPEC.md`. Encrypting them
  with the OS keychain would make the settings file non-portable between machines
  and would break the export/import round-trip that the whole local-first design
  depends on. Treat the data directory the way you treat a password file, and if
  you point the data directory at a synced drive, understand that you are syncing
  those tokens too.
- **Network traffic only happens when you ask for it.** The app talks to
  api.todoist.com when you push or sync, and to api.anthropic.com when you run an
  AI import. Nothing else leaves the machine, and there is no telemetry.

Given that model, findings along the lines of "a local user can read the settings
file" or "the token is not encrypted at rest" are documented behavior rather than
vulnerabilities, and are better raised as a design discussion in an issue.

## Reporting a vulnerability

If you find something that does cross a real boundary — remote code execution
through an imported file, a path traversal in the blob protocol or the
import/export paths, a way for the renderer to reach Node primitives past the
context bridge, or a dependency advisory that actually reaches the shipped code —
please report it privately rather than opening a public issue.

Use GitHub's private reporting at
https://github.com/thowland/ariadne/security/advisories/new, or email
th@wdogsystems.com.

Include what you did, what happened, and the version from **Settings → About** or
`package.json`. A reproduction case matters more than a severity score.

This is a personal project maintained in spare time, so I will not promise a
response-time SLA I cannot keep. Realistically, expect an acknowledgement within
a week or so, and a fix released as a patch version once there is one worth
shipping.

## Supported versions

The most recent release is the only supported one. There are no backported fixes
for older tags, so the upgrade path for a security fix is to install the newest
release.
