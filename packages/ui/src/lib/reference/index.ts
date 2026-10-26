/**
 * Node-safe entry for reference themes: the build manifest, plus the metadata
 * readers renderers share. Components and renderers live in
 * `@svartz/ui/reference/runtime`.
 */
import type { SvartzTheme, ThemeComponentLoader } from '@svartz/core';
import { svartzSyntax } from '../syntax.js';
import { createReferenceTheme, type ReferenceThemeConfig, type ReferenceThemeIdentity } from './theme.js';

type Loader = () => Promise<{ default: unknown }>;
const lazy = (load: () => Promise<unknown>): Loader => load as Loader;
const named = (load: () => Promise<Record<string, unknown>>, name: string): ThemeComponentLoader =>
	lazy(() => load().then((module) => ({ default: module[name] })));
const content = () => import('../content/index.js') as Promise<Record<string, unknown>>;

/**
 * A reference theme's build manifest. Pair it with the runtime `referenceTheme`
 * from `@svartz/ui/reference/runtime`, which adds the renderers; both give the
 * same routes, so either can serve the build.
 *
 * ```js
 * // theme/index.js
 * import { referenceTheme } from '@svartz/ui/reference';
 * export default (config) => referenceTheme({ id: '@acme/docs-theme' }, config);
 * ```
 */
export function referenceTheme(identity: ReferenceThemeIdentity, config?: ReferenceThemeConfig): SvartzTheme {
	return createReferenceTheme(
		identity,
		{
			layout: lazy(() => import('./ReferenceLayout.svelte')),
			notFoundPage: lazy(() => import('./pages/NotFoundPage.svelte')),
			referencePage: lazy(() => import('./pages/ReferencePage.svelte')),
			resourcePage: lazy(() => import('./pages/ResourcePage.svelte')),
			tagListPage: lazy(() => import('./pages/TagListPage.svelte')),
			tagPage: lazy(() => import('./pages/TagPage.svelte')),
			updatesPage: lazy(() => import('./pages/UpdatesPage.svelte')),
			components: {
				callout: named(content, 'Callout'),
				codeBlock: named(content, 'CodeBlock'),
				link: named(content, 'Link'),
				embed: named(content, 'Embed'),
				searchBox: lazy(() => import('../SearchDialog.svelte')),
				comments: lazy(() => import('../Comments.svelte'))
			},
			plugins: [svartzSyntax()]
		},
		config
	);
}

export * from './shared.js';
