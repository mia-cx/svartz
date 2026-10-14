import { defineTheme, type ThemeComponentLoader } from '@svartz/core';
import { svartzSyntax } from '@svartz/ui/syntax';
import { createBlogTheme, type BlogThemeConfig, type BlogThemeModules } from './manifest.js';

type Loader = () => Promise<{ default: unknown }>;

const lazy = (load: () => Promise<unknown>): Loader => load as Loader;
const fromUi = (exportName: string): ThemeComponentLoader =>
	lazy(() => import('@svartz/ui').then((module) => ({ default: (module as Record<string, unknown>)[exportName] })));

const modules: BlogThemeModules = {
	layout: lazy(() => import('./layouts/BlogLayout.svelte')),
	homePage: lazy(() => import('./pages/HomePage.svelte')),
	notFoundPage: lazy(() => import('./pages/NotFoundPage.svelte')),
	tagsPage: lazy(() => import('./pages/TagsPage.svelte')),
	tagPage: lazy(() => import('./pages/TagPage.svelte')),
	archivePage: lazy(() => import('./pages/ArchivePage.svelte')),
	folderListPage: lazy(() => import('./pages/FolderListPage.svelte')),
	folderPage: lazy(() => import('./pages/FolderPage.svelte')),
	components: {
		callout: fromUi('Callout'),
		codeBlock: fromUi('CodeBlock'),
		link: fromUi('Link'),
		embed: fromUi('Embed'),
		searchBox: fromUi('SearchDialog'),
		comments: fromUi('Comments'),
		postCard: lazy(() => import('./components/PostCard.svelte'))
	},
	plugins: [svartzSyntax()]
};

export type { PostMeta } from './blog.js';
export type { BlogRouteConfig, BlogThemeConfig } from './manifest.js';

/** Node-safe manifest used by the build pipeline. */
export default defineTheme((config?: BlogThemeConfig) => createBlogTheme(modules, config));
