# Contributing to Ariadne

Thanks for looking. Ariadne is a personal project that I use every day and
maintain in whatever time is left over, so the guidance below is aimed at making
a contribution land quickly rather than at gatekeeping.

## Before you write code

Open an issue first if the change is more than a small fix. Two reasons, and both
of them are about not wasting your time: some things are deliberate decisions
rather than bugs — the decision table D1–D18 in `docs/TECHNICAL_SPEC.md` records
why the app disagrees with its own prototype in a dozen places — and some things
I already have a half-formed plan for. A five-minute exchange in an issue is a
better outcome than a weekend patch I have to turn down.

Bug reports are more useful with the app version (**Settings → About**), the
platform, what you did, and what happened instead. If the problem is repeatable,
turning on **Settings → Debug logging**, reproducing it, and attaching
`ariadne-debug.log` will usually save a round trip.

## The quality gate

Every change goes through the same gate, mine included:

```sh
npm run format          # Prettier writes; format:check is part of verify
npm run verify          # typecheck + lint + format:check + coverage
npm run test:e2e        # Playwright against the built app (xvfb-run -a on headless Linux)
```

Coverage is enforced at 80% globally in `vitest.config.ts` and does not get
lowered to make a change fit. An obsolete test is deleted rather than skipped,
since a skipped test is a coverage claim nobody is checking.

If a pull request can't pass the gate for a reason that is about the project
rather than the patch, say so in the description and we'll sort it out — that is
a different conversation from a patch that simply hasn't been run yet.

## How the code is laid out

Read the Architecture and "Adding a feature" sections of `README.md` before
starting. The one rule that governs everything else is that domain behavior lives
in `src/shared/` as pure, synchronous, dependency-free TypeScript — no Electron,
no DOM, no filesystem, and no reading the clock. Main-process services and React
components are thin shells over it. A patch that puts business logic in a
component or a service will get sent back, not because of style, but because that
logic then costs a mocked window or a temp directory to test.

Fixing a bug starts with a failing test at the lowest layer that can express it:
domain before service, service before component, component before E2E. If it was
a visual bug, a Playwright screenshot is how you show it's actually fixed.

## Commits and releases

Commit messages describe what changed and why, in the imperative. Fixes ship as
plain commits. User-visible features get a `CHANGELOG.md` entry, a minor version
bump in `package.json`, a `[vX.Y.0]` commit, and a `vX.Y.Z` tag — I handle the
tagging and the release build, so a pull request should not bump the version
itself; that only creates conflicts.

## Licensing of contributions

Ariadne is GPL-3.0-or-later. By opening a pull request you are offering your
contribution under those same terms. There is no CLA and no copyright
assignment — you keep the copyright in what you wrote.
