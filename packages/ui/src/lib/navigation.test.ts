import { describe, expect, it } from 'vitest';
import { buildBreadcrumbs, buildExplorerTree, folderBreadcrumbs, folderLayout, openFolderIds } from './navigation.js';
import { folderContents, topLevelSections } from './listing.js';

const note = (slug: string, path: string, title = slug) => ({ slug, path, title, href: `/${slug}/` });
const folder = (slug: string, title: string, noteSlugs: string[]) => ({
	slug,
	title,
	noteCount: noteSlugs.length,
	noteSlugs,
	href: `/folders/${slug}/`
});

// A root `guides.md` and `guides/index.md` both want `guides`; the folder note lost.
const collided = [
	note('index', 'index.md', 'Home'),
	note('guides', 'guides.md', 'Root guide'),
	note('guides-2', 'guides/index.md', 'Field guides'),
	note('guides/setup', 'guides/setup.md', 'Setup')
];
const collidedFolders = [folder('guides', 'Field guides', ['guides-2', 'guides/setup'])];

describe('folderLayout', () => {
	it.each(['guides', 'guides-2'])('recognizes _index.md published as %s', (slug) => {
		const landing = note(slug, 'Guides/_index.md', 'Field guides');
		const entries = [
			...(slug === 'guides-2' ? [note('guides', 'guides.md', 'Root guide')] : []),
			landing,
			note('guides/setup', 'Guides/setup.md', 'Setup')
		];
		const folders = [folder('guides', 'Field guides', [slug, 'guides/setup'])];
		expect(folderLayout(entries, folders).noteOf('guides')).toBe(landing);
		const tree = buildExplorerTree(entries, folders);
		expect(tree[0]?.href).toBe(landing.href);
		expect(tree[0]?.children.map((entry) => entry.id)).toEqual(['note:guides/setup']);
		expect(buildBreadcrumbs(slug, entries, '/', folders)).toEqual([
			{ title: 'Home', href: '/' },
			{ title: 'Field guides', href: landing.href }
		]);
		expect(folderContents('guides', entries, folders).notes.map((entry) => entry.slug)).toEqual(['guides/setup']);
		expect(topLevelSections(entries, folders).find((section) => section.slug === 'guides')).toMatchObject({
			slug: 'guides',
			title: 'Field guides',
			href: landing.href,
			entries: [entries.at(-1)]
		});
	});

	it('places notes by file, whatever slug they published under', () => {
		const layout = folderLayout(collided, collidedFolders);
		expect(layout.folderOf('guides-2')).toBe('guides');
		expect(layout.folderOf('guides')).toBeUndefined();
		expect(layout.noteOf('guides')?.title).toBe('Field guides');
	});

	it('places a note in the deepest folder that lists it', () => {
		const layout = folderLayout(
			[note('a/b/c', 'a/b/c.md')],
			[folder('a', 'A', ['a/b/c']), folder('a/b', 'B', ['a/b/c'])]
		);
		expect(layout.folderOf('a/b/c')).toBe('a/b');
	});

	it('falls back to the slug for a locked note, which publishes without a path', () => {
		const layout = folderLayout([note('vault', '')], [folder('vault', 'Vault', ['vault'])]);
		expect(layout.noteOf('vault')?.slug).toBe('vault');
	});
});

describe('explorer tree', () => {
	it('lists folders first, then notes in natural order, without the home note', () => {
		const tree = buildExplorerTree(
			[
				note('index', 'index.md', 'Home'),
				note('note-10', 'note-10.md', 'Note 10'),
				note('note-9', 'note-9.md', 'Note 9'),
				note('zeta/a', 'zeta/a.md', 'A'),
				note('alpha/b', 'alpha/b.md', 'B')
			],
			[folder('alpha', 'Alpha', ['alpha/b']), folder('zeta', 'Zeta', ['zeta/a'])]
		);
		expect(tree.map((node) => node.title)).toEqual(['Alpha', 'Zeta', 'Note 9', 'Note 10']);
	});

	it('links a folder to its folder note and keeps a colliding root note out of it', () => {
		const tree = buildExplorerTree(collided, collidedFolders);
		expect(tree.map((node) => [node.title, node.href])).toEqual([
			['Field guides', '/guides-2/'],
			['Root guide', '/guides/']
		]);
		expect(tree[0]?.children.map((node) => node.title)).toEqual(['Setup']);
	});

	it('links a folder without a folder note to its folder page', () => {
		const tree = buildExplorerTree([note('log/day-1', 'Log/day-1.md')], [folder('log', 'Log', ['log/day-1'])]);
		expect(tree[0]?.href).toBe('/folders/log/');
	});
});

describe('openFolderIds', () => {
	it('opens the folder and every folder above it', () => {
		expect(openFolderIds('guides/setup')).toEqual(['folder:guides', 'folder:guides/setup']);
		expect(openFolderIds(undefined)).toEqual([]);
	});
});

describe('breadcrumbs', () => {
	it('walks the folders a note sits in, linking folder notes', () => {
		const entries = [...collided, note('guides/deep/first-run', 'guides/deep/first-run.md', 'First run')];
		const folders = [
			folder('guides', 'Field guides', ['guides-2', 'guides/setup', 'guides/deep/first-run']),
			folder('guides/deep', 'Deep', ['guides/deep/first-run'])
		];
		expect(buildBreadcrumbs('guides/deep/first-run', entries, '/', folders)).toEqual([
			{ title: 'Home', href: '/' },
			{ title: 'Field guides', href: '/guides-2/' },
			{ title: 'Deep', href: '/folders/guides/deep/' },
			{ title: 'First run', href: '/guides/deep/first-run/' }
		]);
	});

	it("ends a folder note's trail at its own folder, and leaves a root note at the root", () => {
		expect(buildBreadcrumbs('guides-2', collided, '/', collidedFolders)).toEqual([
			{ title: 'Home', href: '/' },
			{ title: 'Field guides', href: '/guides-2/' }
		]);
		expect(buildBreadcrumbs('guides', collided, '/', collidedFolders)).toEqual([
			{ title: 'Home', href: '/' },
			{ title: 'Root guide', href: '/guides/' }
		]);
	});

	it('gives a folder page its folder trail', () => {
		expect(folderBreadcrumbs('guides', collided, '/blog/', collidedFolders)).toEqual([
			{ title: 'Home', href: '/blog/' },
			{ title: 'Field guides', href: '/guides-2/' }
		]);
	});

	it('falls back to slug segments for a slug the index lacks', () => {
		expect(buildBreadcrumbs('docs/guides/setup', [], '/site/')).toEqual([
			{ title: 'Home', href: '/site/' },
			{ title: 'Docs', href: '/site/docs/' },
			{ title: 'Guides', href: '/site/docs/guides/' },
			{ title: 'Setup', href: '/site/docs/guides/setup/' }
		]);
	});
});
