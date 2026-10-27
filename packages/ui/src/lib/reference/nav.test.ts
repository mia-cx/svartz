import { describe, expect, it } from 'vitest';
import { filterReferenceNav, folderTrail, navLinks, readingOrder, referenceNav, type ReferenceNavFolder } from './nav.js';
import type { ReferenceNavItem } from './renderers.js';

interface Note {
	slug: string;
	title: string;
	path: string;
	href: string;
	item?: ReferenceNavItem;
	properties?: Record<string, unknown>;
}

const note = (path: string, item?: ReferenceNavItem, title = path.replace(/\.md$/, '').split('/').at(-1)!): Note => {
	const slug = path.replace(/(\/index)?\.md$/, '');
	return { slug, title, path, href: `/${slug}/`, item };
};
const operation = (method: string, path: string, order = 0): ReferenceNavItem => ({
	badge: { label: method, hue: 'blue' },
	label: path,
	sort: [1, path, order]
});
const tool = (name: string): ReferenceNavItem => ({ badge: { label: 'TOOL', hue: 'amber' }, label: name, sort: [1, name, 0] });
/** The index's folders, each listing the notes whose files sit inside it. */
const foldersOf = (notes: readonly Note[], ...folders: [slug: string, title: string][]) =>
	folders.map(([slug, title]) => ({
		slug,
		title,
		href: `/folders/${slug}/`,
		noteSlugs: notes.filter((item) => item.path.startsWith(`${slug}/`)).map((item) => item.slug),
		noteSlug: notes.find((item) => item.path === `${slug}/index.md`)?.slug
	}));

type Tree = [title: string, links: string[], folders: Tree[]];
/** A folder as `[title, its own links, its subfolders]`, all the way down. */
const tree = (folder: ReferenceNavFolder<Note>): Tree => [folder.title, folder.links.map((link) => link.item.label), folder.folders.map(tree)];

/** Logitland's shape: Reference > Public API > Authentication > endpoints, beside MCP > Agent tools. */
const reference = () => {
	const notes = [
		note('reference/index.md', undefined, 'Reference'),
		note('reference/moderation.md', undefined, 'Moderation and fixed limits'),
		note('reference/public-api/index.md', undefined, 'Public API'),
		note('reference/public-api/authentication/index.md', undefined, 'Authentication'),
		note('reference/public-api/authentication/post-token.md', operation('POST', '/oauth2/token')),
		note('reference/public-api/authentication/post-register.md', operation('POST', '/register')),
		note('reference/public-api/conversations/get-conversations.md', operation('GET', '/v1/conversations')),
		note('reference/mcp/index.md', undefined, 'MCP'),
		note('reference/mcp/agent-tools/send-message.md', tool('send_message')),
		note('reference/mcp/agent-tools/deep/inner.md', tool('inner_tool'))
	];
	const folders = foldersOf(
		notes,
		['reference', 'Reference'],
		['reference/public-api', 'Public API'],
		['reference/public-api/authentication', 'Authentication'],
		['reference/public-api/conversations', 'Private conversations'],
		['reference/mcp', 'MCP'],
		['reference/mcp/agent-tools', 'Agent tools'],
		['reference/mcp/agent-tools/deep', 'Deep']
	);
	return referenceNav(notes, folders, (entry) => entry.item);
};

describe('referenceNav', () => {
	it('puts guide sections first, then reference sections with schemas before operations in path and method order', () => {
		const notes = [
			note('index.md'),
			note('guides/authentication.md'),
			note('pets/delete-pet.md', operation('DELETE', '/pets/{id}', 4)),
			note('pets/list-pets.md', operation('GET', '/pets')),
			note('pets/get-pet.md', operation('GET', '/pets/{id}')),
			note('pets/pet.md', { badge: { label: 'SCHEMA', hue: 'neutral' }, label: 'Pet', sort: [0, 'Pet', 0] })
		];
		const nav = referenceNav(notes, foldersOf(notes, ['guides', 'Guides'], ['pets', 'Pets']), (entry) => entry.item);
		expect(nav.map(tree)).toEqual([
			['Guides', ['authentication'], []],
			['Pets', ['Pet', '/pets', '/pets/{id}', '/pets/{id}'], []]
		]);
		expect(nav.map((section) => section.reference)).toEqual([false, true]);
	});

	it('names and links a section with its folder note, and leaves that note out of the list', () => {
		const notes = [note('graphql/index.md', undefined, 'GraphQL'), note('graphql/pet.md', operation('QUERY', 'pet'))];
		const [section] = referenceNav(notes, foldersOf(notes, ['graphql', 'GraphQL']), (entry) => entry.item);
		expect([section?.title, section?.href, tree(section!)]).toEqual(['GraphQL', '/graphql/', ['GraphQL', ['pet'], []]]);
	});

	it('nests folders at any depth, each titled by its own name and linked to its folder note', () => {
		const [section] = reference();
		expect(tree(section!)).toEqual([
			'Reference',
			['Moderation and fixed limits'],
			[
				['MCP', [], [['Agent tools', ['send_message'], [['Deep', ['inner_tool'], []]]]]],
				['Public API', [], [['Authentication', ['/oauth2/token', '/register'], []], ['Private conversations', ['/v1/conversations'], []]]]
			]
		]);
		const publicApi = section!.folders[1]!;
		expect([publicApi.href, publicApi.folders.map((folder) => folder.href)]).toEqual([
			'/reference/public-api/',
			['/reference/public-api/authentication/', undefined]
		]);
	});

	it('sorts sections, folders, and pages by `order` first, a folder by its folder note', () => {
		const ordered = (path: string, order: number, item?: ReferenceNavItem) => ({ ...note(path, item), properties: { order } });
		const notes = [
			note('fake-discord/get-guild.md', operation('GET', '/guilds/{id}')),
			ordered('public-api/index.md', 1),
			ordered('public-api/site/index.md', 2),
			note('public-api/site/get-stats.md', operation('GET', '/v1/stats')),
			ordered('public-api/auth/index.md', 1),
			note('public-api/auth/post-token.md', operation('POST', '/oauth2/token')),
			ordered('public-api/auth/post-register.md', 1, operation('POST', '/register'))
		];
		const folders = foldersOf(
			notes,
			['fake-discord', 'Fake Discord'],
			['public-api', 'Public API'],
			['public-api/site', 'Site'],
			['public-api/auth', 'Authentication']
		);
		expect(referenceNav(notes, folders, (entry) => entry.item).map(tree)).toEqual([
			['Public API', [], [['Authentication', ['/register', '/oauth2/token'], []], ['Site', ['/v1/stats'], []]]],
			['Fake Discord', ['/guilds/{id}'], []]
		]);
	});
});

describe('filterReferenceNav', () => {
	it('keeps pages matching every word in their label, title, badge, or any folder above them, and drops empty folders', () => {
		const notes = [
			note('pets/list-pets.md', operation('GET', '/pets'), 'List pets'),
			note('pets/create-pet.md', operation('POST', '/pets'), 'Create a pet'),
			note('pets/get-adoption.md', operation('GET', '/adoptions/{id}'), 'Get an adoption')
		];
		const nav = referenceNav(notes, foldersOf(notes, ['pets', 'Pets']), (entry) => entry.item);
		const titles = (query: string) => navLinks(filterReferenceNav(nav, query)).map((link) => link.entry.title);
		expect(titles('post')).toEqual(['Create a pet']);
		expect(titles('get list')).toEqual(['List pets']);
		expect(titles('ADOPTION')).toEqual(['Get an adoption']);
		// The section title matches too, so a section's name finds all of it.
		expect(titles('pets')).toHaveLength(3);
		expect(filterReferenceNav(nav, 'webhook')).toEqual([]);
	});

	it('keeps the path of folders down to each nested match, and only that path', () => {
		expect(filterReferenceNav(reference(), 'token').map(tree)).toEqual([
			['Reference', [], [['Public API', [], [['Authentication', ['/oauth2/token'], []]]]]]
		]);
		// A folder's own title finds everything under it.
		expect(navLinks(filterReferenceNav(reference(), 'agent tools')).map((link) => link.item.label)).toEqual(['send_message', 'inner_tool']);
	});
});

describe('folderTrail and readingOrder', () => {
	it("names the folders above a page or a folder's overview, outermost first", () => {
		const sections = reference();
		expect(folderTrail(sections, '/reference/public-api/authentication/post-token/')).toEqual([
			'reference/public-api',
			'reference/public-api/authentication'
		]);
		expect(folderTrail(sections, '/reference/public-api/')).toEqual(['reference/public-api']);
		expect(folderTrail(sections, '/reference/moderation/')).toEqual([]);
		expect(folderTrail(sections, '/elsewhere/')).toEqual([]);
	});

	it('reads the sidebar top to bottom, each folder overview before its pages', () => {
		expect(readingOrder(reference()).map((stop) => stop.title)).toEqual([
			'Reference',
			'Moderation and fixed limits',
			'MCP',
			'send-message',
			'inner',
			'Public API',
			'Authentication',
			'post-token',
			'post-register',
			'get-conversations'
		]);
	});
});
