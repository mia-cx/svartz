import type { SvartzPlugin, SvartzTheme, ThemeComponentLoader } from '@svartz/core';
import type { ThemeTokens } from '@svartz/ui';
import { SVARTZ_MARK_SVG, svartzSocialImage } from '@svartz/ui/brand';

/** Route prefixes. The pipeline reads the same keys, so set them here, not in the theme code. */
export interface WikiRouteConfig {
	/** Categories. Default `"tags"`. */
	tags?: string;
	/** All pages and per-folder listings. Default `"folders"`. */
	folders?: string;
	/** Recent changes. Default `"feed"`. */
	feed?: string;
}

/** The vault's `theme` settings for the wiki. */
export interface WikiThemeConfig {
	/** Design token overrides, above the theme's own (`accent`, `paper`, `radius-m`, …). */
	tokens?: ThemeTokens;
	routes?: WikiRouteConfig;
	comments?: Record<string, unknown>;
	footer?: { links?: Record<string, string> };
	[key: string]: unknown;
}

export interface WikiThemeModules {
	readonly layout: ThemeComponentLoader;
	readonly notFoundPage: ThemeComponentLoader;
	readonly categoryIndexPage: ThemeComponentLoader;
	readonly categoryPage: ThemeComponentLoader;
	readonly allPagesPage: ThemeComponentLoader;
	readonly folderPage: ThemeComponentLoader;
	readonly recentChangesPage: ThemeComponentLoader;
	readonly components: Readonly<Record<string, ThemeComponentLoader>>;
	/** Build-time plugins; only the Node manifest supplies them. */
	readonly plugins?: readonly SvartzPlugin[];
}

/** Prefixes the layout uses to link the portal to list pages. */
export const wikiRoutes = (config?: Pick<WikiThemeConfig, 'routes'>) => ({
	tags: config?.routes?.tags ?? 'tags',
	folders: config?.routes?.folders ?? 'folders',
	feed: config?.routes?.feed ?? 'feed'
});

export function createWikiTheme(modules: WikiThemeModules, config?: WikiThemeConfig): SvartzTheme {
	const { tags, folders, feed } = wikiRoutes(config);

	return {
		id: '@svartz/theme-wiki',
		displayName: 'Svartz Wiki',
		description: 'A wiki: infoboxes, categories, recent changes, and references.',
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
			{ id: 'home', pattern: '/', layoutSlot: 'notePage', priority: 100 },
			{ id: 'tags-index', pattern: `/${tags}`, layoutSlot: 'defaultPage', component: modules.categoryIndexPage, priority: 90 },
			{ id: 'tag', pattern: `/${tags}/:slug`, layoutSlot: 'tagPage', component: modules.categoryPage, priority: 80 },
			{ id: 'feed', pattern: `/${feed}`, layoutSlot: 'feedPage', component: modules.recentChangesPage, priority: 75 },
			{ id: 'folders-index', pattern: `/${folders}`, layoutSlot: 'defaultPage', component: modules.allPagesPage, priority: 70 },
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
			toc: true,
			backlinks: true,
			search: true
		},
		artifactRequirements: { index: true, backlinks: true }
	};
}
