import { materializeTheme } from '@svartz/core';
import { describe, expect, it } from 'vitest';
import createNodeTheme from './index.js';
import createRuntimeTheme, { extensions } from './runtime.js';

describe('@svartz/theme-docs manifests', () => {
	it("composes on minimal's routes under the docs theme's name", () => {
		for (const theme of [createRuntimeTheme({ routes: { folders: 'api' } }), createNodeTheme({ routes: { folders: 'api' } })]) {
			expect([theme.id, theme.displayName]).toEqual(['@svartz/theme-docs', 'Svartz Docs']);
			expect(theme.routes.find((route) => route.id === 'folder')?.pattern).toBe('/api/:slug');
		}
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

describe('the symbol renderer', () => {
	const renderer = extensions[0]!.renderers![0]!;
	const entry = {} as Parameters<typeof renderer.detect>[1];

	it('claims notes with `symbol` frontmatter and badges them by kind in the explorer', () => {
		const data = renderer.detect({ symbol: { kind: 'function', name: 'defineTheme' } }, entry);
		expect(renderer.explorerItem?.(data, entry)).toMatchObject({ badge: { label: 'FUNCTION', hue: 'violet' }, label: 'defineTheme' });
	});

	it('leaves guides to the shell', () => {
		expect(renderer.detect({ title: 'Getting started' }, entry)).toBeUndefined();
	});
});
