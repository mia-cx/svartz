import { defineTheme, type ThemeComponentLoader } from '@svartz/core';
import { svartzSyntax } from '@svartz/ui/syntax';
import { createDocsTheme, type DocsThemeConfig, type DocsThemeModules } from './manifest.js';

type Loader = () => Promise<{ default: unknown }>;

const lazy = (load: () => Promise<unknown>): Loader => load as Loader;
const fromUi = (exportName: string): ThemeComponentLoader =>
	lazy(() => import('@svartz/ui').then((module) => ({ default: (module as Record<string, unknown>)[exportName] })));

const modules: DocsThemeModules = {
	layout: lazy(() => import('./layouts/DocsLayout.svelte')),
	notFoundPage: lazy(() => import('./pages/NotFoundPage.svelte')),
	moduleListPage: lazy(() => import('./pages/ModuleListPage.svelte')),
	modulePage: lazy(() => import('./pages/ModulePage.svelte')),
	tagListPage: lazy(() => import('./pages/TagListPage.svelte')),
	tagPage: lazy(() => import('./pages/TagPage.svelte')),
	updatesPage: lazy(() => import('./pages/UpdatesPage.svelte')),
	components: {
		callout: fromUi('Callout'),
		codeBlock: fromUi('CodeBlock'),
		link: fromUi('Link'),
		embed: fromUi('Embed'),
		searchBox: fromUi('SearchDialog'),
		comments: fromUi('Comments'),
		symbolReference: lazy(() => import('./components/SymbolReference.svelte'))
	},
	plugins: [svartzSyntax()]
};

export type { DocSymbol, SymbolKind, SymbolMember, SymbolParameter } from './symbols.js';
export type { DocsRouteConfig, DocsThemeConfig } from './manifest.js';

/** Node-safe manifest used by the build pipeline. */
export default defineTheme((config?: DocsThemeConfig) => createDocsTheme(modules, config));
