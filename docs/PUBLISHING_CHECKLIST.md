# Publishing Ariadne to GitHub — setup checklist

Everything in the repository is ready to push. What remains is the work that has
to happen in your GitHub account and on your machines, in roughly this order.
Steps marked **decide** are choices rather than mechanics; the rest are
keystrokes.

Assumed target: `https://github.com/thowland/ariadne`, public, GPL-3.0-or-later.
If the account name turns out to be something other than `thowland`, it appears
in `package.json` (homepage, repository, bugs), the Todoist User-Agent in
`src/main/services/todoist-service.ts` and its test, `README.md`, `SECURITY.md`,
`CONTRIBUTING.md`, `docs/DISTRIBUTION_README.md`, and
`.github/ISSUE_TEMPLATE/config.yml` — change it everywhere before the first push,
because the User-Agent string is asserted in a test and will fail the gate
otherwise.

## What has already been done

- All 41 commits and 15 tags rewritten from `tim.howland@biogen.com` to
  `th@wdogsystems.com`, author and committer both. Tree content is byte-identical
  to the pre-rewrite state; a full backup bundle sits at
  `<scratchpad>/ariadne-pre-rewrite.bundle` if you ever need it.
- Local `git config user.name`/`user.email` pinned to the personal identity, so
  future commits here don't reintroduce the work address.
- The old `origin`, which pointed at `/Users/th/claudeAppVMShare/ariadne/`, has
  been renamed to `vmshare` to leave `origin` free for GitHub.
- `LICENSE` (canonical GPLv3), `CONTRIBUTING.md`, `SECURITY.md`, CI and release
  workflows, and issue templates added; `package.json` relicensed and given
  repository metadata; README rewritten; the stale Todoist "Import now" section
  in the end-user guide corrected to describe the completion sync that replaced
  it in v1.10.
- Secret sweep: no API keys, tokens, private keys, or credentials in the tracked
  tree or in git history. The only `sk-ant-` strings are the literal test
  fixtures `sk-ant-test` and `sk-ant-abc` and a UI placeholder. The design PDF
  and both prototype HTML files are clean. `.gitignore` already covers `.env*`,
  `data/`, `release/`, `coverage/`, logs, and `.DS_Store`, and now also
  `.claude/settings.local.json`.
- Full gate green on this Mac: 502 unit tests across 50 files, coverage
  thresholds met, typecheck/lint/format clean, 13 Playwright E2E tests passing.

## 1. Two decisions to make first

**Decide — the `wdogsystems` name stays in two places.** The Electron app id is
`com.wdogsystems.ariadne` and the Linux package maintainer is
`th@wdogsystems.com`. The app id is deliberately left alone: changing it makes
an installed copy look like a different application, which on Windows means a
second Start-menu entry and on macOS a fresh container. Leave it unless you have
a reason, and if you do change it, do it before anyone else installs a build.

**Decide — `package-lock.json` is untracked.** It is gitignored today because it
churned between the Mac and Linux checkouts. For a public repository that costs
you three things: contributors don't get reproducible installs, Dependabot can't
open dependency PRs, and CI has to run `npm install` instead of `npm ci`, so a
transitive dependency can change under a build without any commit recording it.
The workflows are written for `npm install` so they work as-is either way.

My recommendation is to commit the lockfile and deal with the churn, because the
churn is noise in a diff while the alternative is builds you cannot reproduce.
If you agree, generate it once on the Mac and commit it:

```sh
git rm --cached package-lock.json 2>/dev/null || true   # no-op; it was never tracked
# remove the "package-lock.json" line from .gitignore first
npm install
git add package-lock.json .gitignore
git commit -m "Track package-lock.json for reproducible installs and Dependabot"
```

Then switch both workflows from `npm install --no-audit --no-fund` to
`npm ci`, and add `cache: 'npm'` to the `actions/setup-node` steps to cut a
minute or so off every run. If you'd rather not, skip this and nothing breaks.

## 2. Create the repository

1. On github.com → **New repository**. Owner `thowland`, name `ariadne`,
   **Public**.
2. Do **not** let GitHub add a README, .gitignore, or license — all three exist
   here, and an initialized repo means a merge conflict on your first push.
3. Description: `A single-user, local-first project and task tracker for the
desktop. Electron + React, your data in plain JSON on your own disk.`
4. Website: leave blank, or point it at the Releases page once one exists.
5. Topics (Settings → General, or the gear by "About"): `electron`, `react`,
   `typescript`, `task-management`, `project-management`, `local-first`,
   `desktop-app`, `gpl`.

## 3. Push

```sh
cd /Users/th/Apps/ariadne
git remote add origin https://github.com/thowland/ariadne.git
git push -u origin master
git push origin --tags          # all 15 version tags
```

Verify before going further: open the repository, click any commit, and confirm
the author shows your personal account rather than an unattributed name. If the
commits show as unattributed, the email on the commits isn't yet verified on your
GitHub account — fix it under **Settings → Emails** by adding and verifying
`th@wdogsystems.com`. GitHub will then retroactively attribute every commit; you
do not need to rewrite anything again.

If you'd rather keep your email out of the public commit log entirely, that is
the one thing that would need another rewrite, and it should be decided now
rather than after the push. The alternative is GitHub's noreply address
(`<id>+thowland@users.noreply.github.com`, shown under Settings → Emails); say
the word and it's the same filter-branch pass.

## 4. Repository settings worth changing

Under **Settings → General**:

- Features: turn **off** Wikis, Projects, and Discussions unless you want them.
  Leave **Issues** on. Fewer surfaces means fewer places to check.
- Pull Requests: tick **Allow squash merging** and untick the other two, so
  outside contributions land as one reviewable commit.
- Tick **Automatically delete head branches**.

Under **Settings → Branches**, a ruleset on `master` protecting against force
pushes and requiring the CI check is worth it even solo, because it turns the
one irreversible mistake into an error message. Since you'll be pushing directly
rather than through PRs, keep it light: protect against force pushes and
deletions, and do **not** require pull requests — that would lock you out of
your own workflow.

Under **Settings → Actions → General**, confirm workflow permissions allow
read/write; the release workflow needs it to create the draft release, and it
already requests `contents: write` explicitly.

Under **Settings → Code security**, turn on **Dependabot alerts** and **secret
scanning with push protection**. Push protection is the one that earns its keep:
it blocks a commit containing a credential before it reaches the network. Only
enable **Dependabot security updates** if you committed the lockfile in step 1;
without one it has nothing to pin against.

Under **Settings → Security → Advisories**, enable **private vulnerability
reporting**, which is what the link in `SECURITY.md` and the issue-template
config point at.

## 5. First release

CI runs on the first push. Let it go green before tagging, since the release
workflow doesn't depend on CI and will happily build a broken tag.

**Expect the Actions tab to show only CI at first.** GitHub surfaces a workflow
once one of its triggers has actually fired. `ci.yml` fires on the first push to
`master`, so it appears immediately; `release.yml` only fires on a tag push, and
every tag pushed in step 3 points at a commit from before `.github/` existed, so
nothing matched it. Until then there is no Release entry in the sidebar and
therefore no **Run workflow** button — `workflow_dispatch` is configured, but you
can't reach it. This is a chicken-and-egg, not a broken workflow file. Confirm
what GitHub actually registered with:

```sh
curl -s https://api.github.com/repos/<you>/ariadne/actions/workflows | grep '"path"'
```

Break the cycle by pushing a tag from a commit that contains `release.yml`:

- **Re-point the existing tag.** `git tag -f v1.13.0 HEAD && git push <remote> v1.13.0 --force`.
  Force-updating a published tag is normally off limits, but it's harmless on a
  repository this new — no release published, no clones. Check `git diff` against
  the old tag first and make sure nothing user-visible moved, or you'll ship a
  build that disagrees with its own changelog entry.
- **Ship a fresh tag.** Do a normal release per the README (changelog entry,
  version bump, commit, tag, push) and let the tag push trigger it.

Once either has run, Release is registered for good, and **Run workflow** becomes
available for rebuilding any tag by hand — it runs the workflow file from the
default branch and checks out whatever tag you name, so it works on tags that
predate the workflow.

Either way the workflow builds an AppImage and a .deb on Ubuntu, a universal DMG
and zip on macOS, and an NSIS installer on Windows, attaches the end-user guide
as `README.txt`, and opens a **draft** release. Review the assets, edit the notes,
then publish. Nothing goes out until you click publish.

Expect the first run to take 15–25 minutes, mostly the macOS universal build
downloading two Electron binaries.

**Verify the artifacts before publishing.** Download the DMG onto this Mac and
install it, because the CI Mac build is the one configuration nobody has ever
tested here — local `package:mac` builds run against your keychain, CI builds run
ad-hoc-signed on a clean runner. If the macOS build misbehaves, the fallback is
to build it locally with `npm run package:mac:universal` and upload the DMG to
the draft release by hand.

**Note on Todoist verification.** Live token-authenticated Todoist and Anthropic
checks can only happen on this Mac with real credentials. The test suite covers
the request and error paths against mocked HTTP, so a green CI run is not
evidence that the integrations work against the live services — do a manual push
and sync from an installed build before telling anyone the release is good.

## 6. Point the friends and family at it

The README's "Installing a release" section and `docs/DISTRIBUTION_README.md`
between them cover what a non-technical user needs, including the Gatekeeper and
SmartScreen friction, which is the thing that generates the first support
question every time. Worth linking the Releases page directly rather than the
repository root, since the repo root leads with build instructions.

The unsigned-build friction is the main obstacle to this feeling professional.
Code signing costs $99/yr for Apple and roughly $200–400/yr for a Windows
certificate, and the README documents the notarization path if it ever becomes
worth it. For a friends-and-family distribution, a sentence of warning in the
email that carries the link does the same job for free.

## 7. Housekeeping on the other checkout

The history rewrite changed every commit hash, so the Linux VM checkout and
`/Users/th/claudeAppVMShare/ariadne/` are now on a divergent history that shares
no commits with this one. Pulling will not reconcile it. Re-clone from GitHub on
the VM instead:

```sh
git clone https://github.com/thowland/ariadne.git
cd ariadne && npm install
```

Keep a separate clone per OS, per the README's "Shared folders" note — the
Electron and rollup binaries in `node_modules/` are platform-specific, and an
install on one side breaks the other.

Once the VM is re-cloned from GitHub, the `vmshare` remote here has no further
purpose and can go: `git remote remove vmshare`.

## Quick reference

| Item               | Value                                                                             |
| ------------------ | --------------------------------------------------------------------------------- |
| Repository         | `https://github.com/thowland/ariadne`                                             |
| License            | GPL-3.0-or-later (`LICENSE`, 674 lines, canonical FSF text)                       |
| Current version    | 1.13.0, tagged `v1.13.0`                                                          |
| Commits / tags     | 41 / 15, all authored `Tim Howland <th@wdogsystems.com>`                          |
| Pre-rewrite backup | `<scratchpad>/ariadne-pre-rewrite.bundle`                                         |
| CI                 | `.github/workflows/ci.yml` — verify on Node 24, E2E under xvfb                    |
| Release            | `.github/workflows/release.yml` — 3 platforms on `v*.*.*` tag push, draft release |
| Local gate         | `npm run format && npm run verify && npm run test:e2e`                            |
