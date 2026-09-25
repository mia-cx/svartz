import type { SvartzTheme, ThemeComponentLoader } from '@svartz/core';

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

export interface MinimalThemeModules {
	readonly siteLayout: ThemeComponentLoader;
	readonly notFoundPage: ThemeComponentLoader;
	readonly tagListPage: ThemeComponentLoader;
	readonly tagPage: ThemeComponentLoader;
	readonly folderListPage: ThemeComponentLoader;
	readonly folderPage: ThemeComponentLoader;
	readonly feedPage: ThemeComponentLoader;
	readonly backlinks: ThemeComponentLoader;
	readonly comments: ThemeComponentLoader;
	readonly graphPanel: ThemeComponentLoader;
	readonly recentNotes: ThemeComponentLoader;
	readonly searchBox: ThemeComponentLoader;
	readonly toc: ThemeComponentLoader;
	readonly noteHeader: ThemeComponentLoader;
}

export function createMinimalTheme(
	modules: MinimalThemeModules,
	config?: MinimalThemeConfig
): SvartzTheme {
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
			defaultPage: modules.siteLayout,
			notePage: modules.siteLayout,
			tagPage: modules.siteLayout,
			folderPage: modules.siteLayout,
			feedPage: modules.siteLayout,
			notFoundPage: modules.notFoundPage
		},
		routes: [
			{ id: 'home', pattern: '/', layoutSlot: 'notePage', priority: 100 },
			{
				id: 'tags-index',
				pattern: `/${tags}`,
				layoutSlot: 'defaultPage',
				component: modules.tagListPage,
				priority: 90
			},
			{
				id: 'tag',
				pattern: `/${tags}/:slug`,
				layoutSlot: 'tagPage',
				component: modules.tagPage,
				priority: 80
			},
			{
				id: 'feed',
				pattern: `/${feed}`,
				layoutSlot: 'feedPage',
				component: modules.feedPage,
				priority: 75
			},
			{
				id: 'folders-index',
				pattern: `/${folders}`,
				layoutSlot: 'defaultPage',
				component: modules.folderListPage,
				priority: 70
			},
			{
				id: 'folder',
				pattern: `/${folders}/:slug`,
				layoutSlot: 'folderPage',
				component: modules.folderPage,
				priority: 60
			},
			{ id: 'note', pattern: '/:slug', layoutSlot: 'notePage', priority: 10 }
		],
		components: {
			backlinks: modules.backlinks,
			comments: modules.comments,
			graphPanel: modules.graphPanel,
			recentNotes: modules.recentNotes,
			searchBox: modules.searchBox,
			toc: modules.toc,
			noteHeader: modules.noteHeader
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
}
