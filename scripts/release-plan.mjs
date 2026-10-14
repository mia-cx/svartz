import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { appendFileSync, readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BASE_BRANCH, RELEASE_PACKAGES, readReleasePackages } from './release-packages.mjs';
import { registryManifest } from './release-registry.mjs';
import { changedChangesets, validateChangeset } from './check-changesets.mjs';

/** Only the exact merged same-repository Changesets PR authorizes publication. */
export function isReleaseMerge(pullRequests, { sha, repository }) {
  return pullRequests.some((pr) =>
    typeof pr.merged_at === 'string' &&
    pr.merge_commit_sha === sha &&
    pr.base?.ref === BASE_BRANCH &&
    pr.base?.repo?.full_name === repository &&
    pr.head?.ref === `changeset-release/${BASE_BRANCH}` &&
    pr.head?.repo?.full_name === repository
  );
}

/** Stable versions may remain equal or increase, but may never go backwards. */
export function versionIncreased(before, after) {
  const parse = (version) => {
    assert.match(version, /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/);
    return version.split('.').map(BigInt);
  };
  const previous = parse(before);
  const current = parse(after);
  const first = current.findIndex((part, index) => part !== previous[index]);
  if (first === -1) return false;
  assert.ok(current[first] > previous[first], 'Release versions must increase');
  return true;
}

/** Pending notes block publication; missing registry versions also qualify for the first release. */
export function releasePlan(pullRequests, context, versions, { pending = false, missing = [] } = {}) {
  assert.equal(context.repository, 'mia-cx/svartz');
  assert.match(context.sha, /^[a-f0-9]{40}$/);
  const release = context.event === 'push' &&
    context.ref === `refs/heads/${BASE_BRANCH}` &&
    isReleaseMerge(pullRequests, context);
  const packages = release && !pending
    ? Object.entries(versions).filter(([name, [before, after]]) =>
      versionIncreased(before, after) || missing.includes(name)).map(([name]) => name)
    : [];
  return { release, publish: packages.length > 0, pending, packages };
}

/** Refuse an old retry after the fixed group has advanced to a newer release. */
export function requireCurrentVersion(released, current) {
  assert.equal(released, current, 'A newer release exists. Do not replay this release.');
}

const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();

/** Resolve release metadata from the checked-out commit, including all paginated PR results. */
export async function planCurrentRelease(pullRequests, { retry = false, sha = process.env.GITHUB_SHA } = {}) {
  assert.match(sha ?? '', /^[a-f0-9]{40}$/);
  assert.equal(git('rev-parse', 'HEAD'), sha, 'Check out the release commit before planning');
  const context = {
    sha, repository: process.env.GITHUB_REPOSITORY,
    event: retry ? 'push' : process.env.GITHUB_EVENT_NAME,
    ref: retry ? `refs/heads/${BASE_BRANCH}` : process.env.GITHUB_REF,
  };
  const notes = changedChangesets(readdirSync('.changeset').map((name) => `.changeset/${name}`));
  for (const note of notes) validateChangeset(readFileSync(note, 'utf8'), note);
  const packages = readReleasePackages();
  const versions = Object.fromEntries(packages.map(({ name, directory, version }) => [
    name, [JSON.parse(git('show', `${sha}^1:${directory}/package.json`)).version, version],
  ]));
  const missing = [];
  // Ordinary implementation merges never query npm or authorize a publish.
  if (isReleaseMerge(pullRequests, context) && notes.length === 0) {
    for (const { name, version } of packages) {
      if (!await registryManifest(name, version)) missing.push(name);
    }
  }
  return releasePlan(pullRequests, context, versions, { pending: notes.length > 0, missing });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const sha = process.env.SVARTZ_RELEASE_SHA ?? process.env.GITHUB_SHA;
  if (process.argv[2] === 'current') {
    assert.match(sha ?? '', /^[a-f0-9]{40}$/);
    git('fetch', '--no-tags', 'origin', `+refs/heads/${BASE_BRANCH}:refs/remotes/origin/${BASE_BRANCH}`);
    git('merge-base', '--is-ancestor', sha, `origin/${BASE_BRANCH}`);
    for (const [, directory] of RELEASE_PACKAGES) {
      const manifest = `${directory}/package.json`;
      requireCurrentVersion(
        JSON.parse(git('show', `${sha}:${manifest}`)).version,
        JSON.parse(git('show', `origin/${BASE_BRANCH}:${manifest}`)).version,
      );
    }
  } else {
    assert.equal(process.argv[2], undefined);
    const plan = await planCurrentRelease(JSON.parse(readFileSync(0, 'utf8')).flat(), {
      sha, retry: process.env.SVARTZ_RELEASE_RETRY === 'true',
    });
    for (const [name, value] of Object.entries(plan)) {
      const line = `${name}=${Array.isArray(value) ? JSON.stringify(value) : value}\n`;
      process.stdout.write(line);
      if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, line);
    }
  }
}
