import { defineTheme, type ThemeComponentLoader } from '@svartz/core';

type ComponentModule = { default: unknown };

// Static dynamic imports so the bundler can emit chunks; variable import(moduleId) cannot be code-split.
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
		import('@svartz/ui').then((m) => ({
			default: (m as Record<string, unknown>)[exportName]
		}))) as () => Promise<ComponentModule>;

/** Route prefix configuration — keys become URL path segments. */
export interface MinimalRouteConfig {
	/** Prefix for tag pages. Default: `"tags"` → `/tags/`, `/tags/:slug`. */
	tags?: string;
	/** Prefix for folder pages. Default: `"folders"` → `/folders/`, `/folders/:slug`. */
	folders?: string;
	/** Prefix for the chronological feed page. Default: `"feed"` → `/feed/`. */
	feed?: string;
}

export interface MinimalThemeConfig {
	routes?: MinimalRouteConfig;
	[key: string]: unknown;
}

/**
 * Factory exported as `default`. The Svartz Vite plugin calls this at module
 * evaluation time with the vault's `theme.*` config (minus `base`), so route
 * patterns reflect vault-level customisation.
 *
 * Themes that don't need dynamic routes can still export a static `SvartzTheme`
 * object — the runtime handles both.
 */
export default defineTheme((config?: MinimalThemeConfig) => {
	const tags = config?.routes?.tags ?? 'tags';
	const folders = config?.routes?.folders ?? 'folders';
	const feed = config?.routes?.feed ?? 'feed';

	return {
		id: '@svartz/theme-minimal',
		displayName: 'Svartz Minimal',
		description: 'Quartz-like starter theme for Svartz static vault sites.',
		version: '0.0.1',
		contractVersion: '1.0.0',
		layouts: {
			defaultPage: loadSiteLayout,
			notePage: loadSiteLayout,
			tagPage: loadSiteLayout,
			folderPage: loadSiteLayout,
			feedPage: loadSiteLayout,
			notFoundPage: loadNotFoundPage
		},
		routes: [
			{ id: 'home', pattern: '/', layoutSlot: 'notePage', priority: 100 },
			{
				id: 'tags-index',
				pattern: `/${tags}`,
				layoutSlot: 'defaultPage',
				component: loadTagListPage,
				priority: 90
			},
			{
				id: 'tag',
				pattern: `/${tags}/:slug`,
				layoutSlot: 'tagPage',
				component: loadTagPage,
				priority: 80
			},
			{
				id: 'feed',
				pattern: `/${feed}`,
				layoutSlot: 'feedPage',
				component: loadFeedPage,
				priority: 75
			},
			{
				id: 'folders-index',
				pattern: `/${folders}`,
				layoutSlot: 'defaultPage',
				component: loadFolderListPage,
				priority: 70
			},
			{
				id: 'folder',
				pattern: `/${folders}/:slug`,
				layoutSlot: 'folderPage',
				component: loadFolderPage,
				priority: 60
			},
			{ id: 'note', pattern: '/:slug', layoutSlot: 'notePage', priority: 10 }
		],
		components: {
			backlinks: loadFromUi('Backlinks'),
			comments: loadFromUi('Comments'),
			graphPanel: loadFromUi('GraphPanel'),
			recentNotes: loadFromUi('RecentNotes'),
			searchBox: loadFromUi('SearchBox'),
			toc: loadFromUi('TableOfContents'),
			noteHeader: loadFromUi('NoteHeader')
		},
		capabilities: {
			embeds: true,
			codeBlocks: true,
			syntaxHighlighting: true,
			math: true,
			toc: true,
			backlinks: true,
			graph: true,
			search: true
		},
		artifactRequirements: {
			index: true,
			graph: true,
			backlinks: true
		}
	};
});
