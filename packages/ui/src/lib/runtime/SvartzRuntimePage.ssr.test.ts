import { render } from 'svelte/server';
import { describe, expect, it, vi } from 'vitest';
import SvartzRuntimePage from './SvartzRuntimePage.svelte';

// A one-vault host with stub theme pages, as a standalone build generates.
vi.mock('virtual:svartz/host', () => import('./testing/shell/runtime-host'));

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

	it('renders an authored note ahead of a generated tag page at the same URL', () => {
		const { head } = render(SvartzRuntimePage, { props: { pathname: '/tags/testing/' } });
		expect(head).toContain('<title>Authored tag landing | Svartz Test</title>');
	});
});

/** The page's JSON-LD graph, parsed from its one `application/ld+json` script. */
function structuredData(pathname: string) {
	const { head } = render(SvartzRuntimePage, { props: { pathname } });
	const scripts = [...head.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs)];
	expect(scripts).toHaveLength(1);
	return JSON.parse(scripts[0]![1]!);
}

const website = { '@type': 'WebSite', name: 'Svartz Test', url: 'https://example.com/', description: 'A test vault' };

describe('SvartzRuntimePage structured data', () => {
	it('describes the site and the note', () => {
		expect(structuredData('/')).toEqual({
			'@context': 'https://schema.org',
			'@graph': [
				website,
				{
					'@type': 'Article',
					headline: 'Svartz test page',
					description: 'Runtime shell test page.',
					datePublished: '2026-01-01T00:00:00.000Z',
					dateModified: '2026-01-01T00:00:00.000Z',
					url: 'https://example.com/',
					author: { '@type': 'Person', name: 'Svartz' },
					image: 'https://example.com/social.png'
				}
			]
		});
	});

	it('lets the theme map a note to its page kind, with the note\'s breadcrumb trail', () => {
		const [, article, breadcrumbs] = structuredData('/tags/testing/')['@graph'];
		expect(article).toMatchObject({ '@type': 'TechArticle', headline: 'Authored tag landing', url: 'https://example.com/tags/testing/' });
		expect(breadcrumbs).toEqual({
			'@type': 'BreadcrumbList',
			itemListElement: [
				{ '@type': 'ListItem', position: 1, name: 'Home', item: 'https://example.com/' },
				{ '@type': 'ListItem', position: 2, name: 'Tags', item: 'https://example.com/tags/' },
				{ '@type': 'ListItem', position: 3, name: 'Authored tag landing', item: 'https://example.com/tags/testing/' }
			]
		});
	});

	it('describes a folder page by its breadcrumb trail, with no article', () => {
		expect(structuredData('/folders/guides/')['@graph']).toEqual([
			website,
			{
				'@type': 'BreadcrumbList',
				itemListElement: [
					{ '@type': 'ListItem', position: 1, name: 'Home', item: 'https://example.com/' },
					{ '@type': 'ListItem', position: 2, name: 'Guides', item: 'https://example.com/folders/guides/' }
				]
			}
		]);
	});
});
