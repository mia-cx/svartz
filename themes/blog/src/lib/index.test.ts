import { materializeTheme, type IndexEntry, type VaultView } from '@svartz/core';
import { describe, expect, it } from 'vitest';
import createNodeTheme from './index.js';
import createRuntimeTheme from './runtime.js';

describe('@svartz/theme-blog manifests', () => {
	it('loads every layout, route page, and component for SSR', async () => {
		const theme = await materializeTheme(createRuntimeTheme());
		const modules = [
			...Object.values(theme.layouts),
			...theme.routes.map((route) => route.component),
			...Object.values(theme.components ?? {})
		].filter(Boolean);
		for (const module of modules) expect(module).toHaveProperty('default');
		expect(Object.keys(theme.components ?? {})).toEqual(expect.arrayContaining(['callout', 'codeBlock', 'link', 'embed']));
	});

	it('replaces the core syntax plugin at build time only', () => {
		const plugins = createNodeTheme().pluginPreset?.plugins ?? [];
		expect(plugins.map((plugin) => ('id' in plugin ? plugin.id : undefined))).toEqual(['core:transform-syntax']);
		expect(createRuntimeTheme().pluginPreset).toBeUndefined();
	});
});

describe('the blog theme in structured data', () => {
	it("publishes a post as a blog posting with its header's excerpt and byline, without the breadcrumbs posts don't show", () => {
		const post = {
			slug: 'posts/launch',
			path: 'posts/launch.md',
			description: 'The first words of the post, as the index summarises it.',
			properties: { author: 'Caelestis', excerpt: 'Why we built it, in one line.' }
		} as unknown as IndexEntry;
		const vault = { entries: [post], folders: [] } as unknown as VaultView;
		const nodes = {
			article: {
				'@type': 'Article',
				headline: 'Launch',
				description: 'The first words of the post, as the index summarises it.',
				author: { '@type': 'Person', name: 'Site author' }
			},
			breadcrumbs: { '@type': 'BreadcrumbList' }
		};

		expect(createRuntimeTheme().structuredData!(nodes, { entry: post, vault })).toEqual({
			article: {
				'@type': 'BlogPosting',
				headline: 'Launch',
				description: 'Why we built it, in one line.',
				author: { '@type': 'Person', name: 'Caelestis' }
			}
		});
	});
});
