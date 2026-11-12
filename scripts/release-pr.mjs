import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { releaseNotes } from './release-github.mjs';
import { BASE_BRANCH, readReleasePackages } from './release-packages.mjs';

/**
 * Opens or updates the release pull request after `pnpm release:version` has been committed to `RELEASE_BRANCH`.
 *
 * changesets/action finds an open release pull request with the REST `head` filter, which matches nothing in a
 * repository that is a fork, as this one is of jackyzha0/quartz. It then tried to open a second one and failed on
 * every merge. `gh pr list --head` searches through GraphQL, which finds it.
 */
export const RELEASE_BRANCH = `changeset-release/${BASE_BRANCH}`;
export const RELEASE_TITLE = 'chore(release): version packages';

/** The packages this versioning gave a changelog section: those it released. */
export async function versionedPackages(packages, root = process.cwd()) {
  const changelogs = await Promise.all(packages.map(({ directory }) =>
    readFile(join(root, directory, 'CHANGELOG.md'), 'utf8').catch(() => '')));
  return packages.filter(({ version }, index) => changelogs[index].split(/\r?\n/).includes(`## ${version}`));
}

/** Below GitHub's 65,536-character limit on a pull request body, with room to spare, as changesets/action kept. */
export const MAX_BODY = 60_000;

/**
 * The pull request's body: what merging it does, then each released package's notes. Notes too long for a body give
 * way to each package's version and a link to its full changelog on the release branch.
 */
export function releasePrBody(notes, packages) {
  const intro = `Merging this publishes the versions below to npm. Each changeset that lands on \`${BASE_BRANCH}\` updates this pull request.`;
  const body = [intro, '', notes, ''].join('\n');
  if (body.length <= MAX_BODY) return body;
  const links = packages.map(({ name, version, directory }) =>
    `- ${name}@${version}: [changelog](https://github.com/mia-cx/svartz/blob/${RELEASE_BRANCH}/${directory}/CHANGELOG.md)`);
  return [intro, '', 'The notes are too long for this description; each changelog has them.', '', ...links, ''].join('\n');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const packages = await versionedPackages(readReleasePackages());
  const notes = await releaseNotes(packages);
  const gh = (...args) => execFileSync('gh', args, { encoding: 'utf8' }).trim();
  // `--head` matches the branch name in any fork, so only this repository's own pull request counts.
  const open = gh('pr', 'list', '--head', RELEASE_BRANCH, '--base', BASE_BRANCH, '--state', 'open',
    '--json', 'number,isCrossRepository', '--jq', '[.[] | select(.isCrossRepository | not)][0].number // empty');
  const temporary = await mkdtemp(join(tmpdir(), 'svartz-release-pr-'));
  try {
    const body = join(temporary, 'body.md');
    await writeFile(body, releasePrBody(notes, packages));
    if (open) gh('pr', 'edit', open, '--title', RELEASE_TITLE, '--body-file', body);
    else gh('pr', 'create', '--base', BASE_BRANCH, '--head', RELEASE_BRANCH, '--title', RELEASE_TITLE, '--body-file', body);
    console.log(open ? `Updated #${open}` : 'Opened the release pull request');
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}
