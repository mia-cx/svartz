import { describe, expect, it } from 'vitest';
import { themeSettings } from './theme-settings.js';

describe('themeSettings', () => {
	it('enables comments only with all four Giscus ids', () => {
		const ids = { repo: 'o/r', repoId: 'R_1', category: 'Notes', categoryId: 'DIC_1' };
		expect(themeSettings({ comments: ids }).comments).toMatchObject(ids);
		expect(themeSettings({ comments: { ...ids, enabled: false } }).comments).toBeUndefined();
		expect(themeSettings({ comments: { repo: 'o/r' } }).comments).toBeUndefined();
		expect(themeSettings(undefined).comments).toBeUndefined();
	});

	it.each([
		['a light mark only', { src: '/logo.svg' }, { src: '/logo.svg', dark: undefined, alt: '' }],
		[
			'both marks and alt text',
			{ src: '/l.svg', dark: '/d.svg', alt: 'Logo' },
			{ src: '/l.svg', dark: '/d.svg', alt: 'Logo' }
		],
		['no logo', undefined, undefined],
		['a bare string', '/logo.svg', undefined],
		['an empty src', { src: ' ', dark: '/d.svg' }, undefined],
		[
			'a non-string dark mark and alt',
			{ src: '/l.svg', dark: 3, alt: 4 },
			{ src: '/l.svg', dark: undefined, alt: '' }
		]
	])('reads the logo from %s', (_case, logo, expected) => {
		expect(themeSettings({ logo }).logo).toEqual(expected);
	});

	it('reads footer and nav links as label-to-URL maps, dropping bad values', () => {
		const settings = themeSettings({
			footer: { links: { GitHub: 'https://github.com/x', Bad: 3 } },
			nav: { Archive: '/archive/', Tags: '/tags/' }
		});
		expect(settings.footerLinks).toEqual([{ label: 'GitHub', href: 'https://github.com/x' }]);
		expect(settings.navLinks.map((link) => link.label)).toEqual(['Archive', 'Tags']);
	});
});
