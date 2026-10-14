import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { releaseNotes, tagExistsAt } from './release-github.mjs';

test('tag retries accept only the exact commit, including annotated tags', () => {
  const sha = 'a'.repeat(40);
  const tag = '@svartz/core@1.0.0';
  assert.equal(tagExistsAt('', tag, sha), false);
  assert.equal(tagExistsAt(`${sha}\trefs/tags/${tag}\n`, tag, sha), true);
  assert.equal(tagExistsAt(`${'b'.repeat(40)}\trefs/tags/${tag}\n${sha}\trefs/tags/${tag}^{}\n`, tag, sha), true);
  assert.throws(() => tagExistsAt(`${'b'.repeat(40)}\trefs/tags/${tag}`, tag, sha), /another commit/);
});

test('combined notes contain the selected package sections and exclude older versions', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'svartz-notes-test-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const packages = [
    { name: '@svartz/core', directory: 'packages/core', version: '1.0.1' },
    { name: 'svartz', directory: 'packages/cli', version: '1.0.1' },
  ];
  for (const pkg of packages) {
    await mkdir(join(root, pkg.directory), { recursive: true });
    await writeFile(join(root, pkg.directory, 'CHANGELOG.md'),
      `# ${pkg.name}\n\n## 1.0.1\n\nNew ${pkg.name}.\n\n## 1.0.0\n\nOld notes.\n`);
  }
  const notes = await releaseNotes(packages, root);
  assert.match(notes, /# @svartz\/core@1\.0\.1/);
  assert.match(notes, /# svartz@1\.0\.1/);
  assert.doesNotMatch(notes, /Old notes/);
  await writeFile(join(root, packages[0].directory, 'CHANGELOG.md'), '# No release notes\n');
  await assert.rejects(releaseNotes(packages, root), /no section/);
});
