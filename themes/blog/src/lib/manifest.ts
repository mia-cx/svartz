import type { SvartzPlugin, SvartzTheme, ThemeComponentLoader } from '@svartz/core';
import { SVARTZ_MARK_SVG, svartzSocialImage } from '@svartz/ui/brand';

/** Route prefixes. The pipeline reads the same keys. */
export interface BlogRouteConfig {
	/** Tag pages. Default `"tags"`. */
	tags?: string;
	/** Series (folder) pages. Default `"folders"`. */
	folders?: string;
	/** The archive. Default `"feed"`. */
	feed?: string;
}

/** The vault's `theme` settings for the blog. */
export interface BlogThemeConfig {
	routes?: BlogRouteConfig;
	/** Header links, label → URL. Defaults to Archive and Tags. */
	nav?: Record<string, string>;
	comments?: Record<string, unknown>;
	footer?: { links?: Record<string, string> };
	[key: string]: unknown;
}

export interface BlogThemeModules {
	readonly layout: ThemeComponentLoader;
	readonly homePage: ThemeComponentLoader;
	readonly notFoundPage: ThemeComponentLoader;
	readonly tagsPage: ThemeComponentLoader;
	readonly tagPage: ThemeComponentLoader;
	readonly archivePage: ThemeComponentLoader;
	readonly folderListPage: ThemeComponentLoader;
	readonly folderPage: ThemeComponentLoader;
	readonly components: Readonly<Record<string, ThemeComponentLoader>>;
	readonly plugins?: readonly SvartzPlugin[];
}

export const blogRoutes = (config?: Pick<BlogThemeConfig, 'routes'>) => ({
	tags: config?.routes?.tags ?? 'tags',
	folders: config?.routes?.folders ?? 'folders',
	feed: config?.routes?.feed ?? 'feed'
});

export function createBlogTheme(modules: BlogThemeModules, config?: BlogThemeConfig): SvartzTheme {
	const { tags, folders, feed } = blogRoutes(config);

	return {
		id: '@svartz/theme-blog',
		displayName: 'Svartz Blog',
		description: 'A blog: a post grid with tag filters, an archive, and long-form reading.',
		version: '1.0.0',
		contractVersion: '1.0.0',
		socialImage: svartzSocialImage,
		faviconSvg: SVARTZ_MARK_SVG,
		layouts: {
			defaultPage: modules.layout,
			notePage: modules.layout,
			tagPage: modules.layout,
			folderPage: modules.layout,
			feedPage: modules.layout,
			notFoundPage: modules.notFoundPage
		},
		routes: [
			{ id: 'home', pattern: '/', layoutSlot: 'defaultPage', component: modules.homePage, priority: 100 },
			{ id: 'tags-index', pattern: `/${tags}`, layoutSlot: 'defaultPage', component: modules.tagsPage, priority: 90 },
			{ id: 'tag', pattern: `/${tags}/:slug`, layoutSlot: 'tagPage', component: modules.tagPage, priority: 80 },
			{ id: 'feed', pattern: `/${feed}`, layoutSlot: 'feedPage', component: modules.archivePage, priority: 75 },
			{ id: 'folders-index', pattern: `/${folders}`, layoutSlot: 'defaultPage', component: modules.folderListPage, priority: 70 },
			{ id: 'folder', pattern: `/${folders}/:slug`, layoutSlot: 'folderPage', component: modules.folderPage, priority: 60 },
			{ id: 'note', pattern: '/:slug', layoutSlot: 'notePage', priority: 10 }
		],
		components: modules.components,
		pluginPreset: modules.plugins ? { plugins: modules.plugins } : undefined,
		capabilities: {
			callouts: true,
			wikilinks: true,
			embeds: true,
			codeBlocks: true,
			syntaxHighlighting: true,
			math: true,
			search: true
		},
		artifactRequirements: { index: true }
	};
}
