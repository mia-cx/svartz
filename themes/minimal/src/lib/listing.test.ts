import { describe, expect, it } from 'vitest';
import { folderContents, newestFirst, notesTagged } from './listing.js';

const note = (slug: string, date?: string, tags: string[] = []) => ({
	slug,
	title: slug.split('/').at(-1)!,
	href: `/${slug}/`,
	tags,
	modifiedAt: date ? new Date(date) : undefined
});

describe('listing helpers', () => {
	it('sorts newest first, undated last, then by title', () => {
		const sorted = newestFirst([note('b'), note('a', '2026-01-01'), note('c', '2026-03-01'), note('a2')]);
		expect(sorted.map((entry) => entry.slug)).toEqual(['c', 'a', 'a2', 'b']);
	});

	it('lists every note under a folder and its direct subfolders, without its index note', () => {
		const entries = [note('log/index'), note('log/day-1'), note('log/2026/day-2'), note('other/x')];
		const folders = [
			{ slug: 'log', title: 'Log', noteCount: 3, href: '/folders/log/' },
			{ slug: 'log/2026', title: '2026', noteCount: 1, href: '/folders/log/2026/' },
			{ slug: 'log/2026/q3', title: 'Q3', noteCount: 0, href: '/folders/log/2026/q3/' }
		];
		const contents = folderContents('log', entries, folders);
		expect(contents.notes.map((entry) => entry.slug)).toEqual(['log/day-1', 'log/2026/day-2']);
		expect(contents.folders.map((folder) => folder.slug)).toEqual(['log/2026']);
	});

	it('matches a tag and its nested tags', () => {
		const entries = [note('a', undefined, ['garden']), note('b', undefined, ['garden/herbs']), note('c', undefined, ['gardening'])];
		expect(notesTagged(entries, 'garden').map((entry) => entry.slug)).toEqual(['a', 'b']);
	});
});
