import { describe, expect, it } from 'vitest';
import { buildBreadcrumbs, buildExplorerTree } from './navigation';

describe('explorer tree', () => {
	const entry = (slug: string, title: string) => ({ slug, title, href: `/${slug}/` });

	it('lists folders first, then notes in natural order, without the home note', () => {
		const tree = buildExplorerTree([
			entry('index', 'Home'),
			entry('note-10', 'Note 10'),
			entry('note-9', 'Note 9'),
			entry('zeta/a', 'A'),
			entry('alpha/b', 'B')
		]);
		expect(tree.map((node) => node.title)).toEqual(['Alpha', 'Zeta', 'Note 9', 'Note 10']);
	});

	it('names a folder after its folder entry or index note, and links it there', () => {
		const tree = buildExplorerTree(
			[entry('guides/index', 'Field guides'), entry('guides/setup', 'Setup'), entry('log/day-1', 'Day 1')],
			[{ slug: 'log', title: 'Daily log', noteCount: 1, href: '/folders/log/' }]
		);
		expect(tree.map((node) => [node.title, node.href])).toEqual([
			['Daily log', '/folders/log/'],
			['Field guides', '/guides/index/']
		]);
		expect(tree[1]?.children.map((node) => node.title)).toEqual(['Setup']);
	});
});

describe('breadcrumbs', () => {
	it('uses note, folder index, and folder titles', () => {
		const entries = [
			{ slug: 'guides/index', title: 'Field guides', href: '/guides/' },
			{ slug: 'guides/setup/first-run', title: 'First run', href: '/guides/setup/first-run/' }
		];
		const folders = [{ slug: 'guides/setup', title: 'Setting up', noteCount: 1, href: '/folders/guides/setup/' }];
		expect(buildBreadcrumbs('guides/setup/first-run', entries, '/', folders)).toEqual([
			{ title: 'Home', href: '/' },
			{ title: 'Field guides', href: '/guides/' },
			{ title: 'Setting up', href: '/folders/guides/setup/' },
			{ title: 'First run', href: '/guides/setup/first-run/' }
		]);
	});
});

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
