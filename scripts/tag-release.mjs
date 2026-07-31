/**
 * Tags the version in package.json and pushes the tag, which is what triggers
 * the release build in .github/workflows/release.yml.
 *
 *   npm run release:tag              # tag vX.Y.Z from package.json and push it
 *   npm run release:tag -- --dry-run # print the plan, touch nothing
 *   npm run release:tag -- --remote=origin
 *
 * Pushing the tag starts a public build that publishes a draft GitHub release,
 * so every preflight below is a hard error rather than a warning. In
 * particular the tag is never moved once it exists on the remote: a published
 * tag is somebody's downloaded installer, and repointing it silently changes
 * what that version means. Cut the next patch version instead.
 *
 * This does NOT run the gate. Do that first, per README "Releasing":
 *   npm run format && npm run verify && npm run test:e2e
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Run a git command, returning trimmed stdout; throws on a non-zero exit. */
function git(...args) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
}

function fail(message, hint) {
  console.error(`\n✗ ${message}`);
  if (hint !== undefined) console.error(`  ${hint}`);
  process.exit(1);
}

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const remoteArg = args.find((a) => a.startsWith('--remote='))?.slice('--remote='.length);
const unknown = args.filter((a) => a !== '--dry-run' && !a.startsWith('--remote='));
if (unknown.length > 0) fail(`Unknown argument: ${unknown[0]}`, 'Usage: [--dry-run] [--remote=X]');

// --- What we are releasing -------------------------------------------------

const { version } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const tag = `v${version}`;

// The remote is named `github` in the primary checkout and `origin` in a plain
// clone; `vmshare` is the Mac↔VM folder and must never receive a release tag.
const remotes = git('remote').split('\n').filter(Boolean);
const remote = remoteArg ?? (remotes.includes('github') ? 'github' : 'origin');
if (!remotes.includes(remote)) {
  fail(`No git remote named "${remote}".`, `Remotes here: ${remotes.join(', ') || '(none)'}`);
}
if (remote === 'vmshare') {
  fail('"vmshare" is the Mac↔VM shared folder, not GitHub.', 'Release tags go to "github".');
}

// --- Preflight -------------------------------------------------------------

if (git('status', '--porcelain') !== '') {
  fail('Working tree is dirty.', 'Commit or stash first — the tag must name a committed state.');
}

const changelog = readFileSync(join(root, 'CHANGELOG.md'), 'utf8');
if (!new RegExp(`^## ${version.replaceAll('.', '\\.')}(\\s|$)`, 'm').test(changelog)) {
  fail(`CHANGELOG.md has no "## ${version}" section.`, 'Bump the version and write the entry.');
}

const head = git('rev-parse', 'HEAD');
const branch = git('rev-parse', '--abbrev-ref', 'HEAD');

const remoteTags = git('ls-remote', '--tags', remote);
const published = new RegExp(`^(\\S+)\\s+refs/tags/${tag.replaceAll('.', '\\.')}$`, 'm').exec(
  remoteTags,
);
if (published !== null) {
  fail(
    `${tag} already exists on "${remote}" (${published[1].slice(0, 7)}).`,
    'Released tags are immutable. Bump the version and tag that instead.',
  );
}

const localTag = git('tag', '--list', tag);
if (localTag !== '' && git('rev-parse', tag) !== head) {
  fail(
    `Local tag ${tag} points at ${git('rev-parse', '--short', tag)}, not HEAD.`,
    `It was never pushed, so it is safe to move: git tag -f ${tag} && npm run release:tag`,
  );
}

// The workflow builds the tagged commit; if it is not on the remote branch,
// the release would come from something nobody can see on master.
let onRemoteBranch = false;
try {
  git('merge-base', '--is-ancestor', head, `${remote}/${branch}`);
  onRemoteBranch = true;
} catch {
  onRemoteBranch = false;
}
if (!onRemoteBranch) {
  fail(
    `HEAD is not on ${remote}/${branch}.`,
    `Push the branch first: git push ${remote} ${branch}`,
  );
}

// --- Plan ------------------------------------------------------------------

console.log(`
  version   ${version}
  tag       ${tag}${localTag !== '' ? ' (local tag already at HEAD, reusing)' : ''}
  commit    ${git('log', '-1', '--format=%h %s', 'HEAD')}
  remote    ${remote} → ${git('remote', 'get-url', remote)}
  triggers  .github/workflows/release.yml → draft release with the installers
`);

if (dryRun) {
  console.log('  --dry-run: nothing tagged or pushed.\n');
  process.exit(0);
}

// --- Go --------------------------------------------------------------------

if (localTag === '') git('tag', tag);
console.log(git('push', remote, tag) || `  pushed ${tag} → ${remote}`);
console.log(`
✓ ${tag} pushed. Watch the build, then review and publish the draft release:
  https://github.com/thowland/ariadne/actions
`);
