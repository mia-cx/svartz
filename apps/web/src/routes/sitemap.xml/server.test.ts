import { describe, expect, it } from 'vitest';
import { GET } from './+server';

describe('sitemap.xml', () => {
	it('emits canonical note URLs and modification dates', async () => {
		const response = GET();
		const xml = await response.text();

		expect(response.headers.get('content-type')).toContain('application/xml');
		expect(xml).toContain('<loc>https://example.com/</loc>');
		expect(xml).toContain('<lastmod>');
		expect(xml).not.toContain('https://example.com/index/');
	});
});
