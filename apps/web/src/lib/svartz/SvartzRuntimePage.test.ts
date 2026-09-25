import { render } from 'svelte/server';
import { describe, expect, it } from 'vitest';
import SvartzRuntimePage from './SvartzRuntimePage.svelte';

describe('SvartzRuntimePage SSR', () => {
	it('renders the layout and note content without a loading placeholder', () => {
		const { body, head } = render(SvartzRuntimePage, { props: { pathname: '/' } });

		expect(body).toContain('Svartz test layout');
		expect(body).toContain('Svartz test page');
		expect(body).not.toContain('Loading...');
		expect(head).toContain('<title>Svartz test page | Svartz Test</title>');
		expect(head).toContain('name="description" content="Runtime shell test page."');
		expect(head).toContain('rel="canonical" href="https://example.com/"');
		expect(head).toContain('property="og:title" content="Svartz test page"');
		expect(head).toContain('name="twitter:card" content="summary_large_image"');
	});
});
