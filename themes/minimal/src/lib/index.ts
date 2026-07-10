import { defineTheme, type ThemeComponentLoader } from '@svartz/core';
import {
	createMinimalTheme,
	type MinimalRouteConfig,
	type MinimalThemeConfig,
	type MinimalThemeModules
} from './manifest.js';

type ComponentModule = { default: unknown };

const loadSiteLayout = (): Promise<ComponentModule> =>
	import('./layouts/SiteLayout.svelte') as Promise<ComponentModule>;
const loadNotFoundPage = (): Promise<ComponentModule> =>
	import('./pages/NotFoundPage.svelte') as Promise<ComponentModule>;
const loadTagListPage = (): Promise<ComponentModule> =>
	import('./pages/TagListPage.svelte') as Promise<ComponentModule>;
const loadTagPage = (): Promise<ComponentModule> =>
	import('./pages/TagPage.svelte') as Promise<ComponentModule>;
const loadFolderListPage = (): Promise<ComponentModule> =>
	import('./pages/FolderListPage.svelte') as Promise<ComponentModule>;
const loadFolderPage = (): Promise<ComponentModule> =>
	import('./pages/FolderPage.svelte') as Promise<ComponentModule>;
const loadFeedPage = (): Promise<ComponentModule> =>
	import('./pages/FeedPage.svelte') as Promise<ComponentModule>;

const loadFromUi = (exportName: string): ThemeComponentLoader =>
	(() =>
		import('@svartz/ui').then((module) => ({
			default: (module as Record<string, unknown>)[exportName]
		}))) as () => Promise<ComponentModule>;

const modules: MinimalThemeModules = {
	siteLayout: loadSiteLayout,
	notFoundPage: loadNotFoundPage,
	tagListPage: loadTagListPage,
	tagPage: loadTagPage,
	folderListPage: loadFolderListPage,
	folderPage: loadFolderPage,
	feedPage: loadFeedPage,
	backlinks: loadFromUi('Backlinks'),
	comments: loadFromUi('Comments'),
	graphPanel: loadFromUi('GraphPanel'),
	recentNotes: loadFromUi('RecentNotes'),
	searchBox: loadFromUi('SearchBox'),
	toc: loadFromUi('TableOfContents'),
	noteHeader: loadFromUi('NoteHeader')
};

export type { MinimalRouteConfig, MinimalThemeConfig } from './manifest.js';

/** Node-safe manifest used by the build pipeline. */
export default defineTheme((config?: MinimalThemeConfig) => createMinimalTheme(modules, config));
