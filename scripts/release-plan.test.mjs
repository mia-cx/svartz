import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { isReleaseMerge, releasePlan, releasePullRequest, releaseValidated, requireCurrentVersion, versionIncreased } from './release-plan.mjs';

const context = { sha: 'a'.repeat(40), repository: 'mia-cx/svartz',
  event: 'push', ref: 'refs/heads/sveltekit-rewrite' };
const merged = { merged_at: '2026-10-14T00:00:00Z', merge_commit_sha: context.sha,
  base: { ref: 'sveltekit-rewrite', repo: { full_name: context.repository } },
  head: { ref: 'changeset-release/sveltekit-rewrite', repo: { full_name: context.repository } } };
const versions = { '@svartz/core': ['1.0.0', '1.0.1'], svartz: ['1.0.0', '1.0.1'] };

test('reuse requires this release PR head to pass the exact validation workflow', () => {
  const pr = { ...merged, number: 244, head: { ...merged.head, sha: 'b'.repeat(40) } };
  const run = {
    event: 'pull_request', path: '.github/workflows/release-validation.yml',
    head_sha: pr.head.sha, head_branch: pr.head.ref,
    head_repository: { full_name: context.repository },
    // GitHub empties this list once the release PR merges.
    pull_requests: [], status: 'completed', conclusion: 'success',
  };
  assert.equal(releasePullRequest([pr], context), pr);
  assert.equal(releaseValidated([run], pr), true);
  assert.equal(releaseValidated([{ ...run, path: `${run.path}@refs/heads/sveltekit-rewrite` }], pr), true);
  for (const change of [
    { event: 'push' },
    { head_branch: 'feature' },
    { head_repository: { full_name: 'fork/svartz' } },
    { head_repository: null },
    { path: '.github/workflows/ci.yml' },
    { path: null },
    { head_sha: 'c'.repeat(40) },
    { status: 'in_progress' },
    { conclusion: 'failure' },
    { conclusion: 'skipped' },
  ]) assert.equal(releaseValidated([{ ...run, ...change }], pr), false, JSON.stringify(change));
  assert.equal(releaseValidated([], pr), false);
});

test('only the exact same-repository release merge authorizes publication', () => {
  assert.equal(isReleaseMerge([merged], context), true);
  for (const pr of [
    { ...merged, merged_at: null },
    { ...merged, merge_commit_sha: 'b'.repeat(40) },
    { ...merged, head: { ...merged.head, ref: 'feature' } },
    { ...merged, head: { ...merged.head, repo: { full_name: 'fork/svartz' } } },
    { ...merged, base: { ...merged.base, ref: 'main' } },
    { ...merged, base: { ...merged.base, repo: { full_name: 'fork/svartz' } } },
  ]) {
    assert.equal(isReleaseMerge([pr], context), false);
    assert.equal(releasePullRequest([pr], context), undefined);
  }
});

test('ordinary pushes and dispatches never publish even when a version is missing', () => {
  assert.deepEqual(releasePlan([merged], context, versions).packages, ['@svartz/core', 'svartz']);
  for (const change of [{ event: 'pull_request' }, { event: 'workflow_dispatch' }, { ref: 'refs/tags/svartz@1.0.1' }]) {
    assert.equal(releasePlan([merged], { ...context, ...change }, versions, { missing: ['svartz'] }).publish, false);
  }
  assert.equal(releasePlan([], context, versions).publish, false);
  assert.throws(() => releasePlan([merged], { ...context, repository: 'fork/svartz' }, versions));
  assert.throws(() => releasePlan([merged], { ...context, sha: 'short' }, versions));
});

test('pending changesets block publishing and only changed or missing versions qualify', () => {
  const unchanged = { '@svartz/core': ['1.0.0', '1.0.0'], svartz: ['1.0.0', '1.0.0'] };
  assert.equal(releasePlan([merged], context, versions, { pending: true }).publish, false);
  assert.equal(releasePlan([merged], context, unchanged).publish, false);
  assert.deepEqual(releasePlan([merged], context, unchanged, { missing: ['@svartz/core', 'svartz'] }).packages,
    ['@svartz/core', 'svartz']);
  assert.deepEqual(releasePlan([merged], context, unchanged, { missing: ['@svartz/core'] }).packages, ['@svartz/core']);
});

test('stable versions increase and superseded retries fail', () => {
  assert.equal(versionIncreased('1.0.0', '1.0.0'), false);
  for (const [before, after] of [['1.0.0', '1.0.1'], ['1.9.0', '1.10.0'], ['1.0.0', '2.0.0']]) {
    assert.equal(versionIncreased(before, after), true);
  }
  for (const after of ['0.9.0', '1.0.0-rc.1', 'bad', '01.0.0']) {
    assert.throws(() => versionIncreased('1.0.0', after));
  }
  requireCurrentVersion('1.0.0', '1.0.0');
  assert.throws(() => requireCurrentVersion('1.0.0', '1.0.1'), /newer release/);
});

test('validated CLI reuses a squash-merged tree and falls back on missing evidence or errors', async (t) => {
  const fixture = await mkdtemp(join(tmpdir(), 'svartz-validation-test-'));
  t.after(() => rm(fixture, { recursive: true, force: true }));
  const origin = join(fixture, 'origin');
  const checkout = join(fixture, 'checkout');
  const bin = join(fixture, 'bin');
  await mkdir(origin);
  await mkdir(bin);
  const gitEnv = {
    ...process.env, GIT_AUTHOR_NAME: 'Release test', GIT_AUTHOR_EMAIL: 'release@example.test',
    GIT_COMMITTER_NAME: 'Release test', GIT_COMMITTER_EMAIL: 'release@example.test',
  };
  const git = (cwd, ...args) => execFileSync('git', args, {
    cwd, encoding: 'utf8', env: gitEnv, stdio: 'pipe',
  }).trim();
  git(origin, 'init', '-b', 'sveltekit-rewrite');
  await writeFile(join(origin, 'content'), 'before release');
  git(origin, 'add', '.');
  git(origin, '-c', 'commit.gpgsign=false', 'commit', '-m', 'base');
  const base = git(origin, 'rev-parse', 'HEAD');
  await writeFile(join(origin, 'content'), 'release');
  git(origin, 'add', '.');
  git(origin, '-c', 'commit.gpgsign=false', 'commit', '-m', 'release PR head');
  const head = git(origin, 'rev-parse', 'HEAD');
  git(origin, 'update-ref', 'refs/pull/244/head', head);
  const sha = git(origin, 'commit-tree', `${head}^{tree}`, '-p', base, '-m', 'squash merge');
  git(origin, 'update-ref', 'refs/heads/sveltekit-rewrite', sha);
  git(fixture, 'clone', '--no-local', '--single-branch', '--branch', 'sveltekit-rewrite', origin, checkout);
  assert.throws(() => git(checkout, 'cat-file', '-e', `${head}^{commit}`));

  const pr = { ...merged, number: 244, merge_commit_sha: sha, head: { ...merged.head, sha: head } };
  const run = {
    event: 'pull_request', path: '.github/workflows/release-validation.yml',
    head_sha: head, head_branch: pr.head.ref, head_repository: { full_name: context.repository },
    pull_requests: [], status: 'completed', conclusion: 'success',
  };
  // Only GitHub is faked. Tree identity and fetching the otherwise absent PR head use real git.
  await writeFile(join(bin, 'gh'), `#!/usr/bin/env node
const assert = require('node:assert/strict');
assert.deepEqual(process.argv.slice(2), ['api',
  'repos/mia-cx/svartz/actions/workflows/release-validation.yml/runs?event=pull_request&head_sha=${head}&status=success&per_page=100']);
if (process.env.SVARTZ_TEST_API_ERROR) process.exit(1);
process.stdout.write(process.env.SVARTZ_TEST_RUNS);
`);
  await chmod(join(bin, 'gh'), 0o755);
  const output = join(fixture, 'github-output');
  const env = {
    ...process.env, PATH: `${bin}:${process.env.PATH}`, GITHUB_REPOSITORY: context.repository,
    GITHUB_EVENT_NAME: 'push', GITHUB_REF: context.ref, GITHUB_SHA: sha, SVARTZ_RELEASE_SHA: sha,
    GITHUB_OUTPUT: output, SVARTZ_TEST_RUNS: JSON.stringify({ workflow_runs: [run] }),
    SVARTZ_TEST_API_ERROR: '',
  };
  const script = fileURLToPath(new URL('./release-plan.mjs', import.meta.url));
  const validate = async (expected, { change = {}, pullRequests = [[pr]], warning = false } = {}) => {
    await writeFile(output, '');
    const result = spawnSync(process.execPath, [script, 'validated'], {
      cwd: checkout, encoding: 'utf8', input: JSON.stringify(pullRequests), env: { ...env, ...change },
    });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, `validated=${expected}\n`);
    assert.equal(await readFile(output, 'utf8'), result.stdout);
    if (warning) assert.match(result.stderr, /Unable to reuse release PR validation; requiring fresh validation/);
  };
  await validate(true);
  for (const change of [
    { GITHUB_EVENT_NAME: 'workflow_dispatch', SVARTZ_RELEASE_RETRY: 'true' },
    { GITHUB_REF: 'refs/heads/staging' },
    { GITHUB_REPOSITORY: 'fork/svartz' },
    { SVARTZ_TEST_RUNS: JSON.stringify({ workflow_runs: [] }) },
  ]) await validate(false, { change });
  await validate(false, { pullRequests: [] });
  await validate(false, { change: { SVARTZ_TEST_API_ERROR: 'true' }, warning: true });
  await validate(false, { change: { SVARTZ_TEST_RUNS: 'invalid JSON' }, warning: true });
  // The same successful run cannot validate different content in a merge commit.
  await validate(false, { change: { GITHUB_SHA: base, SVARTZ_RELEASE_SHA: base },
    pullRequests: [[{ ...pr, merge_commit_sha: base }]] });
  // Even a locally available head must not hide a failure to retrieve the PR ref.
  git(origin, 'update-ref', '-d', 'refs/pull/244/head');
  await validate(false, { warning: true });
});

test('release publishing accepts reused validation and preserves its artifact build', async () => {
  const workflow = await readFile(new URL('../.github/workflows/release.yml', import.meta.url), 'utf8');
  const plan = workflow.split('  plan:\n')[1].split('\n  release-pr:')[0];
  assert.match(plan, /actions: read/);
  assert.match(plan, /validated: \$\{\{ steps\.validate\.outputs\.validated \}\}/);
  assert.match(plan, /tee "\$RUNNER_TEMP\/pulls\.json" \| node scripts\/release-plan\.mjs/);
  assert.match(plan, /run: node scripts\/release-plan\.mjs validated < "\$RUNNER_TEMP\/pulls\.json"/);
  const validation = workflow.split('\n  validation:\n')[1].split('\n  publish:')[0];
  assert.match(validation, /if: needs\.plan\.outputs\.publish == 'true' && needs\.plan\.outputs\.validated != 'true'/);
  assert.match(validation, /uses: \.\/\.github\/workflows\/release-validation\.yml/);
  const publish = workflow.split('\n  publish:\n')[1];
  assert.match(publish, /needs: \[plan, validation\]/);
  assert.match(publish, /uses: \.\/\.github\/workflows\/package-publish\.yml/);
  const condition = publish.match(/if: >-\n((?: {6}[^\n]*\n)+)/)[1].trim();
  // The workflow uses the same boolean operators as JavaScript; evaluate its actual gate.
  const publishes = new Function('needs', 'cancelled', `return (${condition});`);
  for (const [planResult, publishOutput, validated, validationResult, cancelled, expected] of [
    ['success', 'true', 'false', 'success', false, true],
    ['success', 'true', 'true', 'skipped', false, true],
    ['failure', 'true', '', 'skipped', false, false],
    ['failure', 'true', 'true', 'skipped', false, false],
    ['success', 'true', '', 'skipped', false, false],
    ['success', 'true', 'false', 'failure', false, false],
    ['success', 'true', 'true', 'cancelled', false, false],
    ['success', 'true', 'true', 'skipped', true, false],
    ['success', 'false', 'true', 'skipped', false, false],
  ]) {
    assert.equal(publishes({
      plan: { result: planResult, outputs: { publish: publishOutput, validated } },
      validation: { result: validationResult },
    }, () => cancelled), expected,
    JSON.stringify({ planResult, publishOutput, validated, validationResult, cancelled }));
  }
  const publishing = await readFile(new URL('../.github/workflows/package-publish.yml', import.meta.url), 'utf8');
  assert.match(publishing, /run: pnpm build[\s\S]*run: node scripts\/release-publish\.mjs publish[\s\S]*run: node scripts\/release-github\.mjs/);
});
