import { materializeTheme } from '@svartz/core';
import { themeRegistry } from '@svartz/ui/reference';
import { describe, expect, it } from 'vitest';
import createNodeTheme from './index.js';
import createRuntimeTheme from './runtime.js';

describe('@svartz/theme-api-docs manifests', () => {
	it('loads every layout, route page, and component for SSR, with the REST, GraphQL, and schema renderers', async () => {
		const theme = await materializeTheme(createRuntimeTheme());
		const modules = [
			...Object.values(theme.layouts),
			...theme.routes.map((route) => route.component),
			...Object.values(theme.components ?? {})
		].filter(Boolean);
		for (const module of modules) expect(module).toHaveProperty('default');
		expect(Object.keys(theme.components ?? {})).toEqual(expect.arrayContaining(['callout', 'codeBlock', 'link', 'embed']));
		expect([...themeRegistry(theme).keys()]).toEqual(['rest', 'graphql', 'schema']);
	});

	it('gives the build and the runtime the same routes, and replaces the core syntax plugin at build time only', () => {
		const config = { routes: { folders: 'reference' } };
		const routes = (theme: ReturnType<typeof createNodeTheme>) => theme.routes.map((route) => route.pattern);
		expect(routes(createNodeTheme(config))).toEqual(routes(createRuntimeTheme(config)));
		const plugins = createNodeTheme().pluginPreset?.plugins ?? [];
		expect(plugins.map((plugin) => ('id' in plugin ? plugin.id : undefined))).toEqual(['core:transform-syntax']);
		expect(createRuntimeTheme().pluginPreset).toBeUndefined();
	});
});
