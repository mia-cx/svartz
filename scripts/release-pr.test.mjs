import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { versionedPackages } from './release-pr.mjs';

test('the release pull request lists only packages with a section for their new version', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'svartz-release-pr-test-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const packages = [
    { name: '@svartz/core', directory: 'packages/core', version: '2.4.0' },
    { name: '@svartz/ui', directory: 'packages/ui', version: '2.4.0' },
    { name: 'svartz', directory: 'packages/cli', version: '2.4.0' },
  ];
  const changelogs = {
    'packages/core': '# @svartz/core\n\n## 2.4.0\n\n### Minor Changes\n\n- New.\n\n## 2.3.0\n',
    // A heading that only starts with the version must not count.
    'packages/ui': '# @svartz/ui\n\n## 2.4.0-next.1\n\n## 2.3.0\n',
  };
  for (const [directory, content] of Object.entries(changelogs)) {
    await mkdir(join(root, directory), { recursive: true });
    await writeFile(join(root, directory, 'CHANGELOG.md'), content);
  }

  assert.deepEqual((await versionedPackages(packages, root)).map(({ name }) => name), ['@svartz/core']);
});
