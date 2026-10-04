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

	it('reads footer and nav links as label-to-URL maps, dropping bad values', () => {
		const settings = themeSettings({
			footer: { links: { GitHub: 'https://github.com/x', Bad: 3 } },
			nav: { Archive: '/archive/', Tags: '/tags/' }
		});
		expect(settings.footerLinks).toEqual([{ label: 'GitHub', href: 'https://github.com/x' }]);
		expect(settings.navLinks.map((link) => link.label)).toEqual(['Archive', 'Tags']);
	});
});
