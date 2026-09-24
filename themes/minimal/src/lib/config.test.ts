import { describe, expect, it } from 'vitest';
import { minimalConfig } from './config.js';

describe('minimalConfig', () => {
	it('enables comments only with all four Giscus ids', () => {
		const ids = { repo: 'o/r', repoId: 'R_1', category: 'Notes', categoryId: 'DIC_1' };
		expect(minimalConfig({ comments: ids }).comments).toMatchObject(ids);
		expect(minimalConfig({ comments: { ...ids, enabled: false } }).comments).toBeUndefined();
		expect(minimalConfig({ comments: { repo: 'o/r' } }).comments).toBeUndefined();
		expect(minimalConfig(undefined).comments).toBeUndefined();
	});

	it('reads footer links as a label-to-URL map', () => {
		expect(minimalConfig({ footer: { links: { GitHub: 'https://github.com/x', Bad: 3 } } }).footerLinks).toEqual([
			{ label: 'GitHub', href: 'https://github.com/x' }
		]);
	});
});
