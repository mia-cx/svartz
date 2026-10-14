import assert from 'node:assert/strict';
import test from 'node:test';
import { isReleaseMerge, releasePlan, requireCurrentVersion, versionIncreased } from './release-plan.mjs';

const context = { sha: 'a'.repeat(40), repository: 'mia-cx/svartz',
  event: 'push', ref: 'refs/heads/sveltekit-rewrite' };
const merged = { merged_at: '2026-10-14T00:00:00Z', merge_commit_sha: context.sha,
  base: { ref: 'sveltekit-rewrite', repo: { full_name: context.repository } },
  head: { ref: 'changeset-release/sveltekit-rewrite', repo: { full_name: context.repository } } };
const versions = { '@svartz/core': ['1.0.0', '1.0.1'], svartz: ['1.0.0', '1.0.1'] };

test('only the exact same-repository release merge authorizes publication', () => {
  assert.equal(isReleaseMerge([merged], context), true);
  for (const pr of [
    { ...merged, merged_at: null },
    { ...merged, merge_commit_sha: 'b'.repeat(40) },
    { ...merged, head: { ...merged.head, ref: 'feature' } },
    { ...merged, head: { ...merged.head, repo: { full_name: 'fork/svartz' } } },
    { ...merged, base: { ...merged.base, ref: 'main' } },
    { ...merged, base: { ...merged.base, repo: { full_name: 'fork/svartz' } } },
  ]) assert.equal(isReleaseMerge([pr], context), false);
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
