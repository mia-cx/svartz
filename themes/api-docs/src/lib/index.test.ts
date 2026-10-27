import { materializeTheme } from '@svartz/core';
import { compositionOf } from '@svartz/theme-minimal/runtime';
import { describe, expect, it } from 'vitest';
import createNodeTheme from './index.js';
import createRuntimeTheme, { extensions } from './runtime.js';

describe('@svartz/theme-api-docs manifests', () => {
	it("extends theme-minimal: minimal's layout and pages load for SSR, with the REST, GraphQL, and schema renderers", async () => {
		const runtime = createRuntimeTheme();
		const theme = await materializeTheme(runtime);
		const modules = [
			...Object.values(theme.layouts),
			...theme.routes.map((route) => route.component),
			...Object.values(theme.components ?? {})
		].filter(Boolean);
		for (const module of modules) expect(module).toHaveProperty('default');
		expect(Object.keys(theme.components ?? {})).toEqual(expect.arrayContaining(['callout', 'codeBlock', 'link', 'embed']));
		const composition = compositionOf(runtime);
		expect(composition.primary).toBe(extensions[0]);
		expect(composition.primary.renderers?.map((renderer) => renderer.id)).toEqual(['rest', 'graphql', 'schema']);
		expect(composition.extensions.at(-1)?.id).toBe('@svartz/theme-minimal');
	});

	it('gives the build and the runtime the same routes, and replaces the core syntax plugin at build time only', () => {
		const config = { routes: { folders: 'reference' } };
		const routes = (theme: ReturnType<typeof createNodeTheme>) => theme.routes.map((route) => route.pattern);
		expect(routes(createNodeTheme(config))).toEqual(routes(createRuntimeTheme(config)));
		const plugins = createNodeTheme().pluginPreset?.plugins ?? [];
		expect(plugins.map((plugin) => ('id' in plugin ? plugin.id : undefined))).toEqual(['core:transform-syntax']);
		expect(createRuntimeTheme().pluginPreset).toBeUndefined();
		expect([createNodeTheme().id, createRuntimeTheme().id]).toEqual(['@svartz/theme-api-docs', '@svartz/theme-api-docs']);
	});
});
