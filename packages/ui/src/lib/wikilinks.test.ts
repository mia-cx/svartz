import { describe, expect, it } from 'vitest';
import { wikilinkSegments } from './wikilinks.js';

describe('wikilinkSegments', () => {
	const entries = [
		{ slug: 'places/vessa', title: 'Vessa', href: '/places/vessa/' },
		{ slug: 'characters/mirelle-ashford', title: 'Mirelle Ashford', href: '/characters/mirelle-ashford/' }
	];

	it('turns [[links]] in frontmatter values into linked segments by title or file name', () => {
		expect(wikilinkSegments('[[Vessa]], Lower Wards', entries)).toEqual([
			{ text: 'Vessa', href: '/places/vessa/' },
			{ text: ', Lower Wards' }
		]);
		expect(wikilinkSegments('[[mirelle-ashford|Mirelle]]', entries)).toEqual([
			{ text: 'Mirelle', href: '/characters/mirelle-ashford/' }
		]);
		expect(wikilinkSegments('[[Nowhere]]', entries)).toEqual([{ text: 'Nowhere' }]);
	});

	it('links a vault path whose file name has an underscore', () => {
		const api = [{ slug: 'reference/api/core/contract_version', title: 'CONTRACT_VERSION', href: '/reference/api/core/contract_version/' }];
		expect(wikilinkSegments('[[reference/api/core/CONTRACT_VERSION|CONTRACT_VERSION]]', api)).toEqual([
			{ text: 'CONTRACT_VERSION', href: '/reference/api/core/contract_version/' }
		]);
	});
});
