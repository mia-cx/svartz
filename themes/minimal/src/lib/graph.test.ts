import { describe, expect, it } from 'vitest';
import { buildGraph } from './graph.js';

const notes = [
	{ slug: 'a', title: 'A', href: '/a/', tags: ['x'] },
	{ slug: 'b', title: 'B', href: '/b/', tags: [] },
	{ slug: 'c', title: 'C', href: '/c/', tags: [] },
	{ slug: 'd', title: 'D', href: '/d/', tags: ['x'] }
];
const links = { a: ['b'], b: ['c'], c: [], d: [] };

describe('buildGraph', () => {
	it('keeps the neighbourhood within depth, following links both ways and through tags', () => {
		const graph = buildGraph({ notes, links, tagHref: (tag) => `/tags/${tag}/` }, 'b', 1);
		expect(graph.nodes.map((node) => node.id).sort()).toEqual(['a', 'b', 'c']);
		expect(graph.links).toHaveLength(2);
	});

	it('reaches tagged notes through the tag node', () => {
		const graph = buildGraph({ notes, links, tagHref: (tag) => `/tags/${tag}/` }, 'a', 2);
		expect(graph.nodes.map((node) => node.id).sort()).toEqual(['#x', 'a', 'b', 'c', 'd']);
		expect(graph.nodes.find((node) => node.id === '#x')).toMatchObject({ kind: 'tag', href: '/tags/x/' });
	});

	it('includes every note at depth -1, and drops links to unpublished notes', () => {
		const graph = buildGraph(
			{ notes, links: { ...links, c: ['secret'] }, tagHref: (tag) => `/tags/${tag}/` },
			'a',
			-1
		);
		expect(graph.nodes).toHaveLength(5);
		expect(graph.links.some((link) => link.target === 'secret')).toBe(false);
	});
});
