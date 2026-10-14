import { defineTheme, type ThemeComponentLoader } from '@svartz/core';
import { svartzSyntax } from '@svartz/ui/syntax';
import { createWikiTheme, type WikiThemeConfig, type WikiThemeModules } from './manifest.js';

type Loader = () => Promise<{ default: unknown }>;

const lazy = (load: () => Promise<unknown>): Loader => load as Loader;
const fromUi = (exportName: string): ThemeComponentLoader =>
	lazy(() => import('@svartz/ui').then((module) => ({ default: (module as Record<string, unknown>)[exportName] })));

const modules: WikiThemeModules = {
	layout: lazy(() => import('./layouts/WikiLayout.svelte')),
	notFoundPage: lazy(() => import('./pages/NotFoundPage.svelte')),
	categoryIndexPage: lazy(() => import('./pages/CategoryIndexPage.svelte')),
	categoryPage: lazy(() => import('./pages/CategoryPage.svelte')),
	allPagesPage: lazy(() => import('./pages/AllPagesPage.svelte')),
	folderPage: lazy(() => import('./pages/FolderPage.svelte')),
	recentChangesPage: lazy(() => import('./pages/RecentChangesPage.svelte')),
	components: {
		callout: fromUi('Callout'),
		codeBlock: fromUi('CodeBlock'),
		link: fromUi('Link'),
		embed: fromUi('Embed'),
		searchBox: fromUi('SearchDialog'),
		comments: fromUi('Comments'),
		infobox: lazy(() => import('./components/Infobox.svelte'))
	},
	plugins: [svartzSyntax()]
};

export type { Infobox, InfoboxSection } from './wiki.js';
export type { WikiRouteConfig, WikiThemeConfig } from './manifest.js';

/** Node-safe manifest used by the build pipeline. */
export default defineTheme((config?: WikiThemeConfig) => createWikiTheme(modules, config));
