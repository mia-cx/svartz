import { describe, expect, it } from 'vitest';
import type { VaultView } from '@svartz/core';
import { pageCrumbs } from './routes.js';

const vault = {
	routes: { mountPath: '/notes' },
	entries: [
		{ slug: 'index', title: 'Home', href: '/notes/' },
		{ slug: 'log/day-1', title: 'Day 1', href: '/notes/log/day-1/' }
	],
	folders: [{ slug: 'log', title: 'Log', noteCount: 1, href: '/notes/folders/log/' }],
	tags: [{ slug: 'weather', title: 'weather', noteCount: 2, href: '/notes/tags/weather/' }]
} as unknown as VaultView;

const route = (id: string, pattern: string, slug?: string) => ({
	route: { id, pattern },
	pathname: '',
	params: { slug }
});

describe('pageCrumbs', () => {
	it('ends with the current page, like Quartz', () => {
		const entry = vault.entries[1]!;
		expect(pageCrumbs(vault, entry, undefined).map((crumb) => crumb.title)).toEqual(['Home', 'Log', 'Day 1']);
	});

	it('shows none on the home page or a missing page', () => {
		expect(pageCrumbs(vault, vault.entries[0], undefined)).toEqual([]);
		expect(pageCrumbs(vault, undefined, undefined)).toEqual([]);
	});

	it('walks list pages through their index route', () => {
		expect(pageCrumbs(vault, undefined, route('tag', '/tags/:slug', 'weather'))).toEqual([
			{ title: 'Home', href: '/notes/' },
			{ title: 'Tags', href: '/notes/tags/' },
			{ title: 'weather', href: '/notes/tags/weather/' }
		]);
		expect(pageCrumbs(vault, undefined, route('folder', '/folders/:slug', 'log')).map((crumb) => crumb.title)).toEqual([
			'Home',
			'Log'
		]);
		expect(pageCrumbs(vault, undefined, route('feed', '/feed')).map((crumb) => crumb.title)).toEqual([
			'Home',
			'Recent notes'
		]);
	});
});
