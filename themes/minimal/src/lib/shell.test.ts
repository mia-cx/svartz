import { buildExplorerTree, type ExplorerItem } from '@svartz/ui';
import { describe, expect, it } from 'vitest';
import { adjacentPages, explorerNotes, explorerTrail, filterExplorer, readingOrder } from './shell.js';

interface Note {
	slug: string;
	title: string;
	path: string;
	href: string;
	properties?: Record<string, unknown>;
	item?: ExplorerItem;
}

const note = (path: string, title: string, item?: ExplorerItem, properties?: Record<string, unknown>): Note => {
	const slug = path.replace(/(\/index)?\.md$/, '');
	return { slug, title, path, href: `/${slug}/`, item, properties };
};
const method = (verb: string, path: string): ExplorerItem => ({ badge: { label: verb, hue: 'blue' }, label: path, sort: [1, path, 0] });
const folder = (notes: readonly Note[], slug: string, title: string) => ({
	slug,
	title,
	href: `/folders/${slug}/`,
	noteCount: 0,
	noteSlugs: notes.filter((item) => item.path.startsWith(`${slug}/`)).map((item) => item.slug),
	noteSlug: notes.find((item) => item.path === `${slug}/index.md`)?.slug
});

// Logitland's shape: Reference > Public API > Authentication > endpoints.
const notes = [
	note('reference/index.md', 'Reference'),
	note('reference/moderation.md', 'Moderation and fixed limits'),
	note('reference/public-api/index.md', 'Public API', undefined, { order: 1 }),
	note('reference/public-api/authentication/post-token.md', 'Exchange a token grant', method('POST', '/oauth2/token')),
	note('reference/public-api/authentication/get-challenge.md', 'Get a challenge', method('GET', '/agent/identity/challenge')),
	note('reference/mcp/index.md', 'MCP', undefined, { order: 2 }),
	note('reference/mcp/agent-tools/get-profile.md', 'Get your profile', { badge: { label: 'TOOL', hue: 'amber' }, label: 'get_profile' })
];
const folders = [
	folder(notes, 'reference', 'Reference'),
	folder(notes, 'reference/public-api', 'Public API'),
	folder(notes, 'reference/public-api/authentication', 'Authentication'),
	folder(notes, 'reference/mcp', 'MCP'),
	folder(notes, 'reference/mcp/agent-tools', 'Agent tools')
];
const tree = buildExplorerTree(notes, folders, (entry) => entry.item);
type Tree = [string, Tree[]];
const shape = (nodes: typeof tree): Tree[] => nodes.map((node) => [node.item?.label ?? node.title, shape(node.children)]);

describe('the explorer tree with theme rows', () => {
	it('nests at any depth, orders by `order`, then by each row, each folder under its own title', () => {
		expect(shape(tree)).toEqual([
			['Reference', [
				['Public API', [['Authentication', [['/agent/identity/challenge', []], ['/oauth2/token', []]]]]],
				['MCP', [['Agent tools', [['get_profile', []]]]]],
				['Moderation and fixed limits', []]
			]]
		]);
	});

	it('finds the folders above a page or a folder page', () => {
		expect(explorerTrail(tree, '/reference/public-api/authentication/post-token/')).toEqual([
			'folder:reference',
			'folder:reference/public-api',
			'folder:reference/public-api/authentication'
		]);
		expect(explorerTrail(tree, '/reference/mcp/')).toEqual(['folder:reference', 'folder:reference/mcp']);
		expect(explorerTrail(tree, '/nowhere/')).toEqual([]);
	});

	it('reads top to bottom for previous and next, folder pages included', () => {
		const order = readingOrder(tree);
		expect(order.map((stop) => stop.title).slice(0, 4)).toEqual(['Reference', 'Public API', 'Authentication', 'Get a challenge']);
		expect(adjacentPages(order, '/reference/public-api/authentication/post-token/')).toEqual({
			previous: { title: 'Get a challenge', href: '/reference/public-api/authentication/get-challenge/' },
			next: { title: 'MCP', href: '/reference/mcp/' }
		});
		expect(adjacentPages(order, '/missing/')).toEqual({});
	});

	it('filters to matches with their folders, matching folder names and badges too', () => {
		expect(shape(filterExplorer(tree, 'token'))).toEqual([['Reference', [['Public API', [['Authentication', [['/oauth2/token', []]]]]]]]]);
		expect(explorerNotes(filterExplorer(tree, 'authentication')).map((node) => node.title)).toEqual(['Get a challenge', 'Exchange a token grant']);
		expect(explorerNotes(filterExplorer(tree, 'tool')).map((node) => node.title)).toEqual(['Get your profile']);
		expect(filterExplorer(tree, 'webhook')).toEqual([]);
	});
});
