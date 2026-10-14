import { defineTheme, type ThemeComponentLoader } from '@svartz/core';
import { svartzSyntax } from '@svartz/ui/syntax';
import { createApiDocsTheme, type ApiDocsThemeConfig, type ApiDocsThemeModules } from './manifest.js';

type Loader = () => Promise<{ default: unknown }>;

const lazy = (load: () => Promise<unknown>): Loader => load as Loader;
const fromUi = (exportName: string): ThemeComponentLoader =>
	lazy(() => import('@svartz/ui').then((module) => ({ default: (module as Record<string, unknown>)[exportName] })));

const modules: ApiDocsThemeModules = {
	layout: lazy(() => import('./layouts/ApiLayout.svelte')),
	notFoundPage: lazy(() => import('./pages/NotFoundPage.svelte')),
	referencePage: lazy(() => import('./pages/ReferencePage.svelte')),
	resourcePage: lazy(() => import('./pages/ResourcePage.svelte')),
	tagListPage: lazy(() => import('./pages/TagListPage.svelte')),
	tagPage: lazy(() => import('./pages/TagPage.svelte')),
	updatesPage: lazy(() => import('./pages/UpdatesPage.svelte')),
	components: {
		callout: fromUi('Callout'),
		codeBlock: fromUi('CodeBlock'),
		link: fromUi('Link'),
		embed: fromUi('Embed'),
		searchBox: fromUi('SearchDialog'),
		comments: fromUi('Comments')
	},
	plugins: [svartzSyntax()]
};

export type {
	ApiOperation,
	ApiParameter,
	ApiResponse,
	GraphqlOperation,
	RestOperation,
	SchemaNode
} from './api.js';
export type { ApiDocsRouteConfig, ApiDocsThemeConfig } from './manifest.js';

/** Node-safe manifest used by the build pipeline. */
export default defineTheme((config?: ApiDocsThemeConfig) => createApiDocsTheme(modules, config));
