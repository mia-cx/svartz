import { afterEach, expect, it, vi } from 'vitest';
import { fetchPreview } from './preview.js';

afterEach(() => vi.unstubAllGlobals());

it('resolves relative links and images against the previewed page', async () => {
	const pageUrl = new URL('/guides/setup/', location.href).href;
	const html = '<main data-sv-preview><a href="../../reference/">Reference</a><img src="../diagram.svg"></main>';
	const response = new Response(html, { headers: { 'content-type': 'text/html' } });
	Object.defineProperty(response, 'url', { value: pageUrl });
	vi.stubGlobal('fetch', vi.fn(async () => response));

	const { nodes } = await fetchPreview(pageUrl);

	expect(nodes[0]?.querySelector('a')?.getAttribute('href')).toBe(new URL('/reference/', location.href).href);
	expect(nodes[0]?.querySelector('img')?.getAttribute('src')).toBe(new URL('/guides/diagram.svg', location.href).href);
});

it('leaves page controls out of the preview', async () => {
	const pageUrl = new URL('/guides/controls/', location.href).href;
	const html = '<main data-sv-preview><h1>Setup</h1><div data-sv-preview-omit><button>Copy page</button></div></main>';
	vi.stubGlobal('fetch', vi.fn(async () => new Response(html, { headers: { 'content-type': 'text/html' } })));

	const { nodes } = await fetchPreview(pageUrl);

	expect(nodes[0]?.textContent).toBe('Setup');
});
