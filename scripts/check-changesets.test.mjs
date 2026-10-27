import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
	changedChangesets,
	checkChangesets,
	isUserFacing,
	parseChangeset,
	validateChangeset
} from './check-changesets.mjs';
import { RELEASE_LINE } from './release-packages.mjs';

const valid = `---
'@svartz/core': patch
'@svartz/ui': minor
---

A note worth releasing.
`;

test('parseChangeset splits frontmatter from the note', () => {
	const { frontmatter, body } = parseChangeset(valid);
	assert.ok(frontmatter.includes('@svartz/core'));
	assert.equal(body, 'A note worth releasing.');
});

test('validateChangeset accepts released packages with patch or minor bumps', () => {
	validateChangeset(valid, 'x.md');
});

test('validateChangeset takes a major bump only to reach the release line', () => {
	const major = `---\n'@svartz/ui': major\n---\nShip it.\n`;
	validateChangeset(major, 'two.md', RELEASE_LINE - 1);
	assert.throws(() => validateChangeset(major, 'bad.md', RELEASE_LINE), /do not take major bumps; a \d+\.0 release raises RELEASE_LINE/);
});

test('validateChangeset rejects malformed files', () => {
	for (const [content, message] of [
		['no frontmatter', 'expected frontmatter'],
		["---\n'@svartz/core': patch\n'@svartz/ui': invalid\n---\nnote\n", 'declare a patch, minor, or major'],
		["---\n'@svartz/core': patch\n'@svartz/core': minor\n---\nnote\n", 'duplicate package'],
		['---\n\n---\nnote\n', 'declare a patch, minor, or major'],
		["---\n'@svartz/web': patch\n---\nnote\n", 'is not a released package'],
		["---\n'@svartz/core': patch\n---\n\n", 'release note is empty']
	]) {
		assert.throws(() => validateChangeset(content, 'bad.md'), new RegExp(message));
	}
});

test('changedChangesets keeps .changeset markdown but not README or config', () => {
	assert.deepEqual(
		changedChangesets([
			'.changeset/new-note.md',
			'.changeset/README.md',
			'.changeset/config.json',
			'src/lib.ts'
		]),
		['.changeset/new-note.md']
	);
});

test('isUserFacing covers public source, types, manifests, and the CLI template', () => {
  for (const file of ['packages/core/src/index.ts', 'packages/ui/src/lib/Button.svelte',
    'packages/cli/src/init.ts', 'packages/cli/template/gitignore', 'themes/wiki/src/lib/index.ts',
    'packages/vite/types/virtual-modules.d.ts', 'themes/wiki/types/index.d.ts',
    'packages/ui/package.json', 'themes/wiki/package.json']) {
    assert.ok(isUserFacing(file), file);
  }
  for (const file of ['apps/web/src/routes/+page.svelte', 'packages/reference/src/index.ts',
    'packages/reference/package.json', 'packages/private/src/index.ts', '.github/workflows/ci.yml',
    'docs/releasing.md', 'packages/core/tests/index.test.ts', 'packages/core/package.json.md',
    'themes/wiki/package.json5']) {
    assert.ok(!isUserFacing(file), file);
  }
});

test('checkChangesets passes a valid changeset over a user-facing diff', () => {
	checkChangesets({
		files: ['packages/core/src/index.ts', '.changeset/note.md'],
		changesets: { '.changeset/note.md': valid }
	});
});

test('checkChangesets fails a user-facing diff without a changeset', () => {
	assert.throws(
		() => checkChangesets({ files: ['packages/core/src/index.ts'], changesets: {} }),
		/without a changeset/
	);
});

test('checkChangesets lets the `no changeset` label through', () => {
	checkChangesets({ files: ['packages/core/src/index.ts'], changesets: {}, labels: ['no changeset'] });
});

test('checkChangesets fails a malformed added changeset', () => {
	assert.throws(
		() =>
			checkChangesets({
				files: ['.changeset/bad.md'],
				changesets: { '.changeset/bad.md': 'not a changeset' }
			}),
		/expected frontmatter/
	);
});

test('checkChangesets ignores non-user-facing diffs', () => {
	checkChangesets({ files: ['.github/workflows/ci.yml'], changesets: {} });
});
