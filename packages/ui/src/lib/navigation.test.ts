import { describe, expect, it } from 'vitest';
import { buildBreadcrumbs, buildExplorerTree } from './navigation';

describe('published vault navigation', () => {
	it('uses allocated note and folder URLs with deployment base', () => {
		const entries = [
			{ slug: 'guides/hello', href: '/site/blog/guides/hello-3/', path: 'guides/hello.md', title: 'Hello' }
		];
		const folders = [{ slug: 'guides', href: '/site/blog/folders/guides/', title: 'Guides', noteCount: 1 }];
		const tree = buildExplorerTree(entries, folders);
		expect(tree[0]?.href).toBe('/site/blog/folders/guides/');
		expect(tree[0]?.children[0]?.href).toBe('/site/blog/guides/hello-3/');
		expect(buildBreadcrumbs('guides/hello', entries, '/site/blog/').at(-1)?.href)
			.toBe('/site/blog/guides/hello-3/');
		expect(buildBreadcrumbs('guides/hello', entries, '/site/blog/', folders)[1]?.href)
			.toBe('/site/blog/folders/guides/');
		expect(buildBreadcrumbs('guides/hello', entries, '/site/blog/')[1]?.href)
			.toBe('/site/blog/guides/');
	});
});
