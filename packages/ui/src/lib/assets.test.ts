import { describe, expect, it } from 'vitest';
import { assetHref } from './assets.js';

describe('assetHref', () => {
	it('resolves an attachment name to its published URL', () => {
		const vault = { routes: { mountPath: '/wiki' }, assets: [{ path: 'attachments/station.svg' }] };
		expect(assetHref(vault, 'station.svg')).toBe('/wiki/attachments/station.svg');
		expect(assetHref(vault, './attachments/station.svg')).toBe('/wiki/attachments/station.svg');
		expect(assetHref(vault, 'https://example.com/a.png')).toBe('https://example.com/a.png');
		expect(assetHref(vault, 'missing.png')).toBeUndefined();
	});
});
