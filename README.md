# Ariadne

A single-user, local-first personal project & task tracker, built as an Electron
desktop application (React + TypeScript + Vite). _Ariadne's thread_ — the line that
guides you through the labyrinth of long-running work.

All data lives on your local filesystem as human-readable JSON plus ordinary files for
attachments. No accounts, no cloud, no database.

## Documentation

- `docs/TECHNICAL_SPEC.md` — object model, services, architecture (engineering source of truth)
- `docs/IMPLEMENTATION_PLAN.md` — sprint plan and quality gates
- `design/` — the original design handoff: `README.md` (design spec + tokens),
  `Throughline.dc.html` (annotated prototype source — the behavior oracle),
  `Ariadne.html` (runnable prototype; open in a browser)

## Installing

Build the desktop packages with `npm run package` (Linux AppImage + deb land in
`release/`; macOS/Windows targets are configured in package.json). Or run from
source with `npm run dev`.

Your data lives in the app's data folder (shown in Settings → Data, changeable
to any directory, e.g. a synced one) as plain JSON plus a `blobs/` folder of
attachments; `backups/` holds rotating snapshots.

## Development

Requires Node ≥ 18.18.

```sh
npm install          # once
npm run dev          # launch the app with hot reload
```

### Quality pipeline

```sh
npm test                 # unit/integration tests (Vitest)
npx vitest run <path>    # a single test file
npm run test:coverage    # tests + enforced ≥80% coverage thresholds
npm run test:e2e         # Playwright driving the built Electron app
npm run lint             # ESLint over the whole repo (lint:fix to autofix)
npm run format:check     # Prettier (format to write)
npm run typecheck        # tsc project checks (node + web)
npm run verify           # all of the above except e2e — the sprint gate
```

On a headless machine, run the E2E suite under Xvfb: `xvfb-run -a npm run test:e2e`.

### Building

```sh
npm run build            # electron-vite production build (out/)
npm run start            # preview the production build
```

Packaging/installers arrive in Sprint 8 (electron-builder).
