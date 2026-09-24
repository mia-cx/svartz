import { describe, expect, it } from 'vitest';
import { alphabetical, byDay, featuredNote, readHatnote, readInfobox, wikilinkSegments } from './wiki.js';

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

describe('wikilinkSegments', () => {
	const entries = [
		{ slug: 'places/vessa', title: 'Vessa', href: '/places/vessa/' },
		{ slug: 'characters/mirelle-ashford', title: 'Mirelle Ashford', href: '/characters/mirelle-ashford/' }
	];

	it('turns [[links]] in infobox values into linked segments by title or file name', () => {
		expect(wikilinkSegments('[[Vessa]], Lower Wards', entries)).toEqual([
			{ text: 'Vessa', href: '/places/vessa/' },
			{ text: ', Lower Wards' }
		]);
		expect(wikilinkSegments('[[mirelle-ashford|Mirelle]]', entries)).toEqual([
			{ text: 'Mirelle', href: '/characters/mirelle-ashford/' }
		]);
		expect(wikilinkSegments('[[Nowhere]]', entries)).toEqual([{ text: 'Nowhere' }]);
	});
});

describe('page helpers', () => {
	it('reads a hatnote string', () => {
		expect(readHatnote({ hatnote: 'For the indoor unit, see Base station.' })).toBe('For the indoor unit, see Base station.');
		expect(readHatnote({ hatnote: 3 })).toBeUndefined();
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
