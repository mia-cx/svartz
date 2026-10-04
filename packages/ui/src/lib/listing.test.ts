import { describe, expect, it } from 'vitest';
import { folderContents, newestFirst, noteDate, notesTagged, topLevelSections } from './listing.js';

const note = (slug: string, date?: string, tags: string[] = []) => ({
	slug,
	title: slug.split('/').at(-1)!,
	path: `${slug}.md`,
	href: `/${slug}/`,
	tags,
	modifiedAt: date ? new Date(date) : undefined
});
/** `folder/index.md`, published under `slug` (a suffix when another file took the folder's URL). */
const folderNote = (folder: string, slug: string, title: string) => ({ ...note(slug), title, path: `${folder}/index.md` });
const folder = (slug: string, title: string, noteSlugs: string[], noteSlug?: string) => ({
	slug,
	title,
	noteCount: noteSlugs.length,
	noteSlugs,
	noteSlug,
	href: `/folders/${slug}/`
});

describe('listing helpers', () => {
	it('sorts newest first, undated last, then by title', () => {
		const sorted = newestFirst([note('b'), note('a', '2026-01-01'), note('c', '2026-03-01'), note('a2')]);
		expect(sorted.map((entry) => entry.slug)).toEqual(['c', 'a', 'a2', 'b']);
	});

	it('lists every note in a folder and its direct subfolders, without its folder note', () => {
		// The root `log.md` took the folder's URL; it isn't in the folder.
		const entries = [note('log'), folderNote('log', 'log-2', 'Log'), note('log/day-1'), note('log/2026/day-2'), note('other/x')];
		const folders = [
			folder('log', 'Log', ['log-2', 'log/day-1', 'log/2026/day-2'], 'log-2'),
			folder('log/2026', '2026', ['log/2026/day-2']),
			folder('log/2026/q3', 'Q3', [])
		];
		const contents = folderContents('log', entries, folders);
		expect(contents.notes.map((entry) => entry.slug)).toEqual(['log/day-1', 'log/2026/day-2']);
		expect(contents.folders.map((folder) => folder.slug)).toEqual(['log/2026']);
	});

	it('skips an unparseable date for the next valid one', () => {
		expect(noteDate({ ...note('a'), modifiedAt: 'not-a-date', createdAt: '2026-09-25T00:30:00.000Z' })).toBe(
			'2026-09-25T00:30:00.000Z'
		);
	});

	it('matches a tag and its nested tags', () => {
		const entries = [note('a', undefined, ['garden']), note('b', undefined, ['garden/herbs']), note('c', undefined, ['gardening'])];
		expect(notesTagged(entries, 'garden').map((entry) => entry.slug)).toEqual(['a', 'b']);
	});

	it('groups notes by top-level folder; a folder note links its section', () => {
		const entries = [
			folderNote('graphql', 'graphql-2', 'GraphQL'),
			note('graphql/pet'),
			note('graphql/types/pet-type'),
			note('pets/list'),
			note('graphql'),
			note('index')
		];
		const folders = [
			folder('graphql', 'GraphQL', ['graphql-2', 'graphql/pet', 'graphql/types/pet-type'], 'graphql-2'),
			folder('graphql/types', 'Types', ['graphql/types/pet-type']),
			folder('pets', 'Pets', ['pets/list'])
		];
		expect(
			topLevelSections(entries, folders).map((section) => [section.slug, section.title, section.href, section.entries.map((entry) => entry.slug)])
		).toEqual([
			['graphql', 'GraphQL', '/graphql-2/', ['graphql/pet', 'graphql/types/pet-type']],
			['pets', 'Pets', '/folders/pets/', ['pets/list']],
			['', '', undefined, ['graphql']]
		]);
	});

	it('keeps a folder note whose folder has nothing else, as an empty section', () => {
		const sections = topLevelSections([folderNote('core', 'core', 'Core')], [folder('core', 'Core', ['core'], 'core')]);
		expect(sections.map((section) => [section.slug, section.title, section.href, section.entries.length])).toEqual([
			['core', 'Core', '/core/', 0]
		]);
	});
});
