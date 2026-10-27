import { describe, expect, it } from 'vitest';
import { filterReferenceNav, referenceNav } from './nav.js';
import type { ReferenceNavItem } from './renderers.js';

interface Note {
	slug: string;
	title: string;
	path: string;
	href: string;
	item?: ReferenceNavItem;
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
/** The index's folders, each listing the notes whose files sit inside it. */
const foldersOf = (notes: readonly Note[], ...folders: [slug: string, title: string][]) =>
	folders.map(([slug, title]) => ({
		slug,
		title,
		href: `/folders/${slug}/`,
		noteSlugs: notes.filter((item) => item.path.startsWith(`${slug}/`)).map((item) => item.slug),
		noteSlug: notes.find((item) => item.path === `${slug}/index.md`)?.slug
	}));
const labels = (sections: ReturnType<typeof referenceNav<Note>>) =>
	sections.map((section) => [section.title, section.groups.map((group) => [group.title ?? '', group.links.map((link) => link.item.label)])]);

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
		expect(labels(nav)).toEqual([
			['Guides', [['', ['authentication']]]],
			['Pets', [['', ['Pet', '/pets', '/pets/{id}', '/pets/{id}']]]]
		]);
		expect(nav.map((section) => section.reference)).toEqual([false, true]);
	});

	it('names and links a section with its folder note, and leaves that note out of the list', () => {
		const notes = [note('graphql/index.md', undefined, 'GraphQL'), note('graphql/pet.md', operation('QUERY', 'pet'))];
		const [section] = referenceNav(notes, foldersOf(notes, ['graphql', 'GraphQL']), (entry) => entry.item);
		expect([section?.title, section?.href, labels([section!])[0]?.[1]]).toEqual(['GraphQL', '/graphql/', [['', ['pet']]]]);
	});

	it('groups nested folders under their section, titled by their path and linked only to a folder note', () => {
		const notes = [
			note('reference/index.md', undefined, 'Reference'),
			note('reference/moderation.md'),
			note('reference/public-api/index.md', undefined, 'Public API'),
			note('reference/public-api/auth/post-token.md', operation('POST', '/oauth2/token')),
			note('reference/mcp/call.md', { badge: { label: 'TOOL', hue: 'amber' }, label: 'call_operation', sort: [1, 'call_operation', 0] })
		];
		const folders = foldersOf(
			notes,
			['reference', 'Reference'],
			['reference/mcp', 'MCP'],
			['reference/public-api', 'Public API'],
			['reference/public-api/auth', 'Authentication']
		);
		const [section] = referenceNav(notes, folders, (entry) => entry.item);
		expect(section?.groups.map((group) => [group.title, group.href, group.links.map((link) => link.item.label)])).toEqual([
			[undefined, undefined, ['moderation']],
			['MCP', undefined, ['call_operation']],
			['Public API', '/reference/public-api/', []],
			['Public API / Authentication', undefined, ['/oauth2/token']]
		]);
	});

	it('sorts sections, groups, and pages by `order` first, a folder by its folder note', () => {
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
		expect(labels(referenceNav(notes, folders, (entry) => entry.item))).toEqual([
			['Public API', [['Authentication', ['/register', '/oauth2/token']], ['Site', ['/v1/stats']]]],
			['Fake Discord', [['', ['/guilds/{id}']]]]
		]);
	});
});

describe('filterReferenceNav', () => {
	it('keeps pages matching every word in their label, title, badge, or group, and drops empty groups', () => {
		const notes = [
			note('pets/list-pets.md', operation('GET', '/pets'), 'List pets'),
			note('pets/create-pet.md', operation('POST', '/pets'), 'Create a pet'),
			note('pets/get-adoption.md', operation('GET', '/adoptions/{id}'), 'Get an adoption')
		];
		const nav = referenceNav(notes, foldersOf(notes, ['pets', 'Pets']), (entry) => entry.item);
		const titles = (query: string) =>
			filterReferenceNav(nav, query).flatMap((section) => section.groups.flatMap((group) => group.links.map((link) => link.entry.title)));
		expect(titles('post')).toEqual(['Create a pet']);
		expect(titles('get list')).toEqual(['List pets']);
		expect(titles('ADOPTION')).toEqual(['Get an adoption']);
		// The section title matches too, so a section's name finds all of it.
		expect(titles('pets')).toHaveLength(3);
		expect(filterReferenceNav(nav, 'webhook')).toEqual([]);
	});
});
