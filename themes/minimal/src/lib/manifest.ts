import type { SvartzPlugin, SvartzTheme, ThemeComponentLoader } from '@svartz/core';
import type { ThemeTokens } from '@svartz/ui';
import { SVARTZ_MARK_SVG, svartzSocialImage } from '@svartz/ui/brand';

/** Route prefix configuration: keys become URL path segments. */
export interface MinimalRouteConfig {
	/** Prefix for tag pages. Default: `"tags"` → `/tags/`, `/tags/:slug`. */
	tags?: string;
	/** Prefix for folder pages. Default: `"folders"` → `/folders/`, `/folders/:slug`. */
	folders?: string;
	/** Prefix for the chronological feed page. Default: `"feed"` → `/feed/`. */
	feed?: string;
}

/** The vault's `theme` settings for minimal. */
export interface MinimalThemeConfig {
	/** Design token overrides, above the theme's own (`accent`, `paper`, `radius-m`, …). */
	tokens?: ThemeTokens;
	routes?: MinimalRouteConfig;
	/** Giscus comments; see docs/comments-and-analytics.md. */
	comments?: Record<string, unknown>;
	/** Footer links, label → URL. */
	footer?: { links?: Record<string, string> };
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
	/** Content slots and reusable components hosts may pick up. */
	readonly components: Readonly<Record<string, ThemeComponentLoader>>;
	/** Build-time plugins; only the Node manifest supplies them. */
	readonly plugins?: readonly SvartzPlugin[];
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
		description: 'Publish an Obsidian vault with an explorer, search, graph, and backlinks.',
		version: '1.0.0',
		contractVersion: '1.0.0',
		socialImage: svartzSocialImage,
		faviconSvg: SVARTZ_MARK_SVG,
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
			{ id: 'tags-index', pattern: `/${tags}`, layoutSlot: 'defaultPage', component: modules.tagListPage, priority: 90 },
			{ id: 'tag', pattern: `/${tags}/:slug`, layoutSlot: 'tagPage', component: modules.tagPage, priority: 80 },
			{ id: 'feed', pattern: `/${feed}`, layoutSlot: 'feedPage', component: modules.feedPage, priority: 75 },
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
