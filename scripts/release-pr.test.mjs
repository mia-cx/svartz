import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MAX_BODY, releasePrBody, versionedPackages } from './release-pr.mjs';

test('notes too long for a pull request give way to versions and changelog links', () => {
  const packages = [{ name: '@svartz/core', directory: 'packages/core', version: '2.4.0' }];

  assert.match(releasePrBody('# @svartz/core@2.4.0\n\nShort.', packages), /Short\./);
  const long = releasePrBody(`# @svartz/core@2.4.0\n\n${'x'.repeat(MAX_BODY)}`, packages);
  assert.ok(long.length <= MAX_BODY);
  assert.match(long, /- @svartz\/core@2\.4\.0: \[changelog\]\(https:\/\/github\.com\/mia-cx\/svartz\/blob\/changeset-release\/sveltekit-rewrite\/packages\/core\/CHANGELOG\.md\)/);
});

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
