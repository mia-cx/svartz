import { describe, expect, it } from 'vitest';
import type { ExplorerNode } from '@svartz/ui';
import { alphabetical, byDay, featuredNote, readArticle, readHatnote, readInfobox, sectionMenu, wikiRoutes } from './wiki.js';

const note = (title: string, modifiedAt?: string, properties: Record<string, unknown> = {}) => ({
	slug: title.toLowerCase(),
	title,
	tags: [] as string[],
	properties,
	modifiedAt: modifiedAt ? new Date(modifiedAt) : undefined
});

describe('readInfobox', () => {
	it('reads rows, sections, image, and caption, and stringifies scalar values', () => {
		const infobox = readInfobox({
			infobox: {
				image: 'station.svg',
				caption: 'The station in September',
				rows: { Location: 'Fence post', Height: 1.5 },
				sections: [{ heading: 'Sensors', rows: { Temperature: 'SHT45' } }]
			}
		});
		expect(infobox).toEqual({
			image: 'station.svg',
			caption: 'The station in September',
			sections: [
				{ heading: undefined, rows: [['Location', 'Fence post'], ['Height', '1.5']] },
				{ heading: 'Sensors', rows: [['Temperature', 'SHT45']] }
			]
		});
	});

	it('ignores malformed frontmatter', () => {
		expect(readInfobox({})).toBeUndefined();
		expect(readInfobox({ infobox: 'nope' })).toBeUndefined();
		expect(readInfobox({ infobox: { rows: { Bad: { nested: true } } } })).toBeUndefined();
	});
});

describe('page helpers', () => {
	it('reads a hatnote string', () => {
		expect(readHatnote({ hatnote: 'For the indoor unit, see Base station.' })).toBe('For the indoor unit, see Base station.');
		expect(readHatnote({ hatnote: 3 })).toBeUndefined();
	});

	it('makes an article of a note with an infobox or a hatnote, and leaves plain notes alone', () => {
		expect(readArticle({ hatnote: 'For the guild, see Lamplighters.' })).toEqual({ infobox: undefined, hatnote: 'For the guild, see Lamplighters.' });
		expect(readArticle({ infobox: { rows: { Role: 'Lamplighter' } } })?.infobox?.sections).toEqual([{ heading: undefined, rows: [['Role', 'Lamplighter']] }]);
		expect(readArticle({ title: 'Plain', infobox: 'nope' })).toBeUndefined();
	});

	it('groups pages A–Z, with everything else under #', () => {
		const groups = alphabetical([note('beta'), note('Alpha'), note('2026 log'), note('apple')]);
		expect(groups.map((group) => [group.letter, group.entries.map((entry) => entry.title)])).toEqual([
			['#', ['2026 log']],
			['A', ['Alpha', 'apple']],
			['B', ['beta']]
		]);
	});

	it('groups changes by day, newest first, and leaves undated pages out', () => {
		const days = byDay([note('a', '2026-09-01T10:00:00Z'), note('b', '2026-09-14T08:00:00Z'), note('c', '2026-09-01T18:00:00Z'), note('d')]);
		expect(days.map((day) => [day.date, day.entries.map((entry) => entry.title)])).toEqual([
			['2026-09-14', ['b']],
			['2026-09-01', ['c', 'a']]
		]);
	});

	it('finds the featured article', () => {
		expect(featuredNote([note('a'), note('b', undefined, { featured: true })])?.title).toBe('b');
	});
});

describe('sectionMenu', () => {
	const page = (slug: string): ExplorerNode => ({ id: `note:${slug}`, title: slug.split('/').at(-1)!, href: `/${slug}/`, children: [], isFolder: false });
	const folder = (slug: string, title: string, children: ExplorerNode[]): ExplorerNode => ({
		id: `folder:${slug}`,
		title,
		href: `/${slug}/`,
		children,
		isFolder: true
	});
	const tree = [
		folder('characters', 'Characters', [
			folder('characters/lamplighters', "Lamplighters' Guild", [
				page('characters/lamplighters/mirelle'),
				folder('characters/lamplighters/wardens', 'Wardens', [page('characters/lamplighters/wardens/ada')])
			]),
			page('characters/quill'),
			page('characters/zed')
		]),
		page('about')
	];
	const folders = [
		{ slug: 'characters', href: '/folders/characters/' },
		{ slug: 'characters/lamplighters', href: '/folders/characters/lamplighters/' }
	];

	it('makes top-level folders the bar, subfolders flyouts, and deeper folders plain links', () => {
		const [characters, ...rest] = sectionMenu(tree, folders, 2);
		expect(rest).toEqual([]);
		expect(characters).toMatchObject({ title: 'Characters', allHref: '/folders/characters/', more: 1 });
		expect(characters!.items.map((item) => item.title)).toEqual(["Lamplighters' Guild", 'quill']);
		const guild = characters!.items[0]!.folder!;
		expect(guild.items.map((item) => [item.title, item.folder])).toEqual([
			['mirelle', undefined],
			['Wardens', undefined]
		]);
		expect(guild.allHref).toBe('/folders/characters/lamplighters/');
	});
});

describe('wikiRoutes', () => {
	it("links the portal to the list pages' prefixes, renamed or not", () => {
		expect(wikiRoutes(undefined)).toEqual({ tags: 'tags', folders: 'folders', feed: 'feed' });
		expect(wikiRoutes({ routes: { tags: 'categories', feed: 3 } })).toEqual({ tags: 'categories', folders: 'folders', feed: 'feed' });
	});
});
