import { defineTheme, type ThemeComponentLoader } from '@svartz/core';
import { svartzSyntax } from '@svartz/ui/syntax';
import { composeBuildTheme, type ThemeIdentity } from './compose.js';
import type { ThemeBuildExtension } from './extension.js';
import type { MinimalThemeConfig, MinimalThemeModules } from './manifest.js';

type ComponentModule = { default: unknown };
type Loader = () => Promise<ComponentModule>;

const lazy = (load: () => Promise<unknown>): Loader => load as Loader;
const fromUi = (exportName: string): ThemeComponentLoader =>
	lazy(() =>
		import('@svartz/ui').then((module) => ({ default: (module as Record<string, unknown>)[exportName] }))
	);

const modules: MinimalThemeModules = {
	siteLayout: lazy(() => import('./layouts/SiteLayout.svelte')),
	notFoundPage: lazy(() => import('./pages/NotFoundPage.svelte')),
	tagListPage: lazy(() => import('./pages/TagListPage.svelte')),
	tagPage: lazy(() => import('./pages/TagPage.svelte')),
	folderListPage: lazy(() => import('./pages/FolderListPage.svelte')),
	folderPage: lazy(() => import('./pages/FolderPage.svelte')),
	feedPage: lazy(() => import('./pages/FeedPage.svelte')),
	components: {
		callout: fromUi('Callout'),
		codeBlock: fromUi('CodeBlock'),
		link: fromUi('Link'),
		embed: fromUi('Embed'),
		searchBox: fromUi('SearchDialog'),
		comments: fromUi('Comments'),
		backlinks: lazy(() => import('./components/Backlinks.svelte')),
		graphPanel: lazy(() => import('./components/Graph.svelte')),
		toc: lazy(() => import('./components/Toc.svelte'))
	},
	plugins: [svartzSyntax()]
};

/** The build manifest for themes composed on minimal: minimal's routes with each theme's build plugins. */
export const composeThemes = (extensions: readonly ThemeBuildExtension[], config?: MinimalThemeConfig, identity?: ThemeIdentity) =>
	composeBuildTheme(modules, extensions, config, identity);

/** Minimal's own build extension. */
export const extensions: readonly ThemeBuildExtension[] = [{ id: '@svartz/theme-minimal', name: 'minimal', displayName: 'Svartz Minimal' }];

export type { MinimalRouteConfig, MinimalThemeConfig } from './manifest.js';
export type { ThemeBuildExtension } from './extension.js';
export type { ThemeIdentity } from './compose.js';

/** Node-safe manifest used by the build pipeline. */
export default defineTheme((config?: MinimalThemeConfig) => composeThemes(extensions, config));
