import { materializeTheme } from '@svartz/core';
import { describe, expect, it } from 'vitest';
import createNodeTheme from './index.js';
import createRuntimeTheme from './runtime.js';

describe('@svartz/theme-wiki manifests', () => {
	it("is the wiki on minimal's routes, in both manifests", () => {
		for (const theme of [createRuntimeTheme(), createNodeTheme()]) {
			expect([theme.id, theme.displayName]).toEqual(['@svartz/theme-wiki', 'Svartz Wiki']);
			expect(theme.routes.map((route) => route.id)).toEqual(['home', 'tags-index', 'tag', 'feed', 'folders-index', 'folder', 'note']);
		}
	});

	it('honours renamed list routes', () => {
		const theme = createNodeTheme({ routes: { tags: 'categories', feed: 'recent' } });
		expect(theme.routes.find((route) => route.id === 'tags-index')?.pattern).toBe('/categories');
		expect(theme.routes.find((route) => route.id === 'feed')?.pattern).toBe('/recent');
	});

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
