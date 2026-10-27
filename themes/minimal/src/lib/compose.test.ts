import type { SvartzPlugin } from '@svartz/core';
import { describe, expect, it } from 'vitest';
import { compositionOf } from './compose.js';
import type { ThemeExtension } from './extension.js';
import { composeThemes as composeBuild } from './index.js';
import { composeThemes as composeRuntime } from './runtime.js';

const wiki: ThemeExtension = { id: '@svartz/theme-wiki', name: 'wiki', displayName: 'Svartz Wiki', version: '2.0.0', chrome: { graph: false } };
const api: ThemeExtension = { id: '@svartz/theme-api-docs', renderers: [] };

describe('composeThemes', () => {
	it('carries the composition for the layout, primary first and minimal last', () => {
		const theme = composeRuntime([wiki, api]);
		const composition = compositionOf(theme);
		expect(composition.primary).toBe(wiki);
		expect(composition.extensions.map((extension) => extension.id)).toEqual(['@svartz/theme-wiki', '@svartz/theme-api-docs', '@svartz/theme-minimal']);
		expect([theme.id, theme.displayName, theme.version]).toEqual(['@svartz/theme-wiki', 'Svartz Wiki', '2.0.0']);
	});

	it("names the site's theme when the host gives one, and keeps minimal's routes either way", () => {
		const theme = composeRuntime([api, wiki], undefined, { id: '@acme/docs-theme', displayName: 'Acme docs' });
		expect([theme.id, theme.displayName]).toEqual(['@acme/docs-theme', 'Acme docs']);
		expect(theme.routes.map((route) => route.id)).toEqual(['home', 'tags-index', 'tag', 'feed', 'folders-index', 'folder', 'note']);
	});

	it("serves the primary theme's own 404 page", () => {
		const NotFound = (() => null) as never;
		expect(composeRuntime([{ id: '@svartz/theme-blog', pages: { notFound: NotFound } }]).layouts.notFoundPage).toEqual({ default: NotFound });
		expect(composeRuntime([api]).layouts.notFoundPage).toEqual(composeRuntime([]).layouts.notFoundPage);
	});

	it('treats a manifest without a composition as minimal alone', () => {
		expect(compositionOf(undefined).extensions.map((extension) => extension.id)).toEqual(['@svartz/theme-minimal']);
	});

	it("adds every theme's build plugins after minimal's, one per id", () => {
		const plugin = (id: string): SvartzPlugin => ({ id, name: id }) as unknown as SvartzPlugin;
		const theme = composeBuild([
			{ id: '@svartz/theme-docs', plugins: [plugin('docs:symbols')], capabilities: { toc: true } },
			{ id: '@svartz/theme-wiki', plugins: [plugin('docs:symbols'), plugin('wiki:infobox')] }
		]);
		expect(theme.pluginPreset?.plugins?.map((item) => ('id' in item ? item.id : undefined))).toEqual([
			'core:transform-syntax',
			'docs:symbols',
			'wiki:infobox'
		]);
		expect(theme.id).toBe('@svartz/theme-docs');
	});
});
