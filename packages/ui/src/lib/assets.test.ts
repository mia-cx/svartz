import { describe, expect, it } from 'vitest';
import { assetHref } from './assets.js';

describe('assetHref', () => {
	it('resolves an attachment name to its published URL', () => {
		const vault = { routes: { mountPath: '/wiki' }, assets: [{ path: 'attachments/station.svg' }] };
		const note = { path: 'places/station.md' };
		expect(assetHref(vault, note, 'station.svg')).toBe('/wiki/attachments/station.svg');
		expect(assetHref(vault, note, '../attachments/station.svg')).toBe('/wiki/attachments/station.svg');
		expect(assetHref(vault, note, '/attachments/station.svg')).toBe('/wiki/attachments/station.svg');
		expect(assetHref(vault, note, 'https://example.com/a.png')).toBe('https://example.com/a.png');
		expect(assetHref(vault, note, 'missing.png')).toBeUndefined();
	});

	it('picks the attachment beside the note when two share a name', () => {
		const vault = { routes: { mountPath: '' }, assets: [{ path: 'posts/a/hero.jpg' }, { path: 'posts/b/hero.jpg' }] };
		expect(assetHref(vault, { path: 'posts/b/index.md' }, 'hero.jpg')).toBe('/posts/b/hero.jpg');
		expect(assetHref(vault, { path: 'about.md' }, 'hero.jpg')).toBeUndefined();
	});
});
