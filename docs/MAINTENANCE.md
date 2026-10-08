# Maintenance notes

Dependency upkeep, toolchain limits and platform traps — the things that are
true of the build rather than of the app, and that a version bump can quietly
make false. Each note says when it was last checked; re-check before relying
on one that is old. Commands and the release process are in `README.md`; the
app's behavior is in `docs/TECHNICAL_SPEC.md`.

## Node and npm

Node 24 is the floor (`engines` in `package.json`; CI and the release matrix
run 24.x), set on 2026-08-06 once Node 20 reached end-of-life. Node 26 becomes
LTS in October 2026 and should join the CI matrix then.

npm 11, bundled with Node 24, blocks dependency install scripts unless they are
approved under `allowScripts` in `package.json`. Approvals are pinned per
version (`esbuild@0.25.12: true`), so bumping a dependency that has an install
script needs a fresh `npm approve-scripts <pkg>`, or its install step silently
does not run. `npm approve-scripts --allow-scripts-pending` lists what is
waiting.

npm's optional-dependency bug can drop native modules on any `npm install`.
Prefer `npm ci`, which is what CI and the release builds use.

`npm overrides` pins `@noble/hashes@^1`, because electron-builder 26 loads it
through CommonJS. Keep the pin when touching dependencies.

## package-lock.json

The lockfile is tracked (since 2026-08-06): Dependabot cannot raise
security-fix pull requests without it, and `npm ci` requires it. The
maintainer's global gitignore excludes lockfiles, so the repository's
`.gitignore` carries an explicit `!package-lock.json` negation; do not remove
it.

The lockfile has to stay **multi-platform**, carrying the optional rollup and
esbuild binaries for Linux, macOS and Windows so that `npm ci` works on every
runner. Regenerating it with `node_modules` present prunes it to the current
platform and breaks CI without any local symptom. The recipe that works:

```sh
mv node_modules /tmp/nm && rm package-lock.json \
  && npm install --package-lock-only && mv /tmp/nm node_modules
grep -c '@rollup/rollup-linux-x64-gnu' package-lock.json   # expect 1
```

The `patch-package` postinstall step errors while `node_modules` is away; that
is harmless, and the lockfile is still written. Resolve merge conflicts in the
lockfile by regenerating it this way, never by hand, and commit it alongside
every `package.json` change.

Bump Ariadne's own version in the lockfile with a line-bounded edit, not a
global find-and-replace: `"version": "2.6.0"` also matches about ten
dependencies, and rewriting those is an install-breaking diff nobody notices
in review. Only the root `.version` and `packages[""].version`, both in the
first dozen lines, belong to Ariadne, so a correct bump is a two-line diff.

## Toolchain ceilings

These are peer-dependency limits rather than Node limits, so a Node bump does
not lift them. Last checked 2026-09-29.

- **Vite is capped at 7**: `electron-vite@5` peers `vite ^5 || ^6 || ^7`. Vite 8
  waits on electron-vite, and `@vitejs/plugin-react` must stay on 5.x until
  then, since 6.x requires Vite 8.
- **ESLint is capped at 9**: `eslint-plugin-react` peers up to `^9.7` and
  `eslint-plugin-import` up to `^9`. `typescript-eslint` and
  `eslint-plugin-react-hooks` already accept 10, so react and import are the
  blockers; switching to `eslint-plugin-import-x` alone would not clear it.
- `eslint-plugin-react-hooks@7` expanded its `recommended` set from 2 rules to 16. `eslint.config.mjs` enables only the two classic rules; P5 in
  `docs/CODE_REVIEW_2026-07-18.md` lists what the rest would flag.

## Electron

Electron 43 ships no install script and fetches its binary lazily on first
`require`. The project's own `postinstall` runs `install-electron` so that a
fresh `npm ci` fails loudly instead of downloading 100MB in the middle of an
E2E run. Do not remove it; a missing `node_modules/electron/dist` is the
symptom.

When bumping Electron, re-test blob previews. Chromium keeps tightening fetches
to custom schemes: the 39 bump needed `corsEnabled` plus
`Access-Control-Allow-Origin` headers on `ariadne-blob://`, verified again on
43 (Chromium 150).

## pdf.js

pdf.js 6 evaluates `DOMMatrix`, `Path2D` and `ImageData` at import time, and
jsdom implements none of them, so every test file that transitively imports
`PdfViewer` fails on module load without the stubs in
`src/renderer/test-setup.ts`. Its API also moved between 4 and 6: teardown is
`loadingTask.destroy()` rather than a method on the document proxy, and
`page.render()` wants `canvas` alongside `canvasContext`.

pdf.js 6 replaced its optional `canvas` dependency with `@napi-rs/canvas`,
which ships prebuilt per-platform skia binaries the renderer never loads.
`build.files` excludes it (`!node_modules/@napi-rs/canvas*/**`), and the
**universal macOS build** depends on that exclusion. npm installs only the
runner's own architecture, so the same `skia.darwin-arm64.node` lands in both
halves of the universal app, and `@electron/universal` refuses to merge an
identical native module that is not listed in `x64ArchFiles`. Linux and
Windows never merge architectures, so they build fine and hide the problem.
The `canvas` entry still in `npm overrides` serves only jsdom's optional peer.

## Tests that read files

A test that needs a stylesheet or other source file as text is a
`*.node.test.ts` and reads it with `fs`, as `tokens.node.test.ts` does. A
`?raw` import looks equivalent but silently resolves to `''` once another test
imports the same CSS normally, and the test then passes against nothing.

## Report PDFs

The print document that `webContents.printToPDF` renders (D26) does not load
`app.css`, so every layout class a report uses needs its own rule in
`REPORT_PRINT_CSS`, and the class-list test in `report-print.test.ts` has to be
extended with it. A class without a rule degrades to a plain block, which is
how an eight-cell grid once printed as sixteen stacked lines. Use explicit
column counts (`repeat(4, 1fr)`) rather than `auto-fit`, which resolves against
the print viewport instead of the paper, and give `<span>`s sized by inline
style an explicit `display`, or they print as nothing.

## Dates

JavaScript's date parsing is lenient: V8 rolls an out-of-range day forward
rather than returning `NaN`, so `2026-02-30` once validated and became March 2.
`isValidIsoDate` in `shared/domain/dates.ts` round-trips the parsed components
to catch that. It backs the workspace schema, the AI import and the menu-bar
quick-add draft, so do not simplify it back to a `Number.isNaN` check.

## Platforms

The E2E suite runs on the **Linux** CI runner, so anything that only works on
macOS passes locally and fails every CI run after it. `setBadgeCount` is the
example: it does nothing on headless Ubuntu, which left CI red for four runs
before anyone looked. Put the cross-platform half of a behavior in the unit
suite and guard only the OS-level assertion with
`process.platform === 'darwin'`, then flip that constant once to make sure the
skipped branch still runs somewhere. The release workflow builds installers
without running E2E, so a broken E2E still ships; check `gh run list` after
pushing.

On the Linux arm64 VM, `mkdirSync` on a `/proc/...` path hangs on its
filesystem; tests that need an fs error use a file standing in for a
directory instead. Repairing a `node_modules` swapped by the other machine is
covered under "Shared folders" in `README.md`.
