import type { SvartzPlugin, SvartzTheme, ThemeComponentLoader } from '@svartz/core';
import type { ThemeTokens } from '@svartz/ui';
import { SVARTZ_MARK_SVG, svartzSocialImage } from '@svartz/ui/brand';

/** Route prefixes. The pipeline reads the same keys. */
export interface ApiDocsRouteConfig {
	/** Tag pages. Default `"tags"`. */
	tags?: string;
	/** Resource pages (top-level folders). Default `"folders"`; `"reference"` reads well. */
	folders?: string;
	/** Recently updated. Default `"feed"`. */
	feed?: string;
}

/** The vault's `theme` settings for API docs. */
export interface ApiDocsThemeConfig {
	/** Design token overrides, above the theme's own (`accent`, `paper`, `radius-m`, …). */
	tokens?: ThemeTokens;
	routes?: ApiDocsRouteConfig;
	/** Base URL for REST request examples. Default `"https://api.example.com"`. */
	baseUrl?: string;
	/** GraphQL endpoint for query examples. Default `"{baseUrl}/graphql"`. */
	graphqlEndpoint?: string;
	/** Shown as a badge beside the API name. */
	version?: string;
	/** Top-bar links, label → URL (status page, changelog, support). */
	nav?: Record<string, string>;
	comments?: Record<string, unknown>;
	footer?: { links?: Record<string, string> };
	[key: string]: unknown;
}

export interface ApiDocsThemeModules {
	readonly layout: ThemeComponentLoader;
	readonly notFoundPage: ThemeComponentLoader;
	readonly referencePage: ThemeComponentLoader;
	readonly resourcePage: ThemeComponentLoader;
	readonly tagListPage: ThemeComponentLoader;
	readonly tagPage: ThemeComponentLoader;
	readonly updatesPage: ThemeComponentLoader;
	readonly components: Readonly<Record<string, ThemeComponentLoader>>;
	readonly plugins?: readonly SvartzPlugin[];
}

export function createApiDocsTheme(modules: ApiDocsThemeModules, config?: ApiDocsThemeConfig): SvartzTheme {
	const tags = config?.routes?.tags ?? 'tags';
	const folders = config?.routes?.folders ?? 'folders';
	const feed = config?.routes?.feed ?? 'feed';

	return {
		id: '@svartz/theme-api-docs',
		displayName: 'Svartz API Docs',
		description: 'REST and GraphQL reference docs: operations, schemas, and request examples.',
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
			{ id: 'tags-index', pattern: `/${tags}`, layoutSlot: 'defaultPage', component: modules.tagListPage, priority: 90 },
			{ id: 'tag', pattern: `/${tags}/:slug`, layoutSlot: 'tagPage', component: modules.tagPage, priority: 80 },
			{ id: 'feed', pattern: `/${feed}`, layoutSlot: 'feedPage', component: modules.updatesPage, priority: 75 },
			{ id: 'folders-index', pattern: `/${folders}`, layoutSlot: 'defaultPage', component: modules.referencePage, priority: 70 },
			{ id: 'folder', pattern: `/${folders}/:slug`, layoutSlot: 'folderPage', component: modules.resourcePage, priority: 60 },
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
			search: true
		},
		artifactRequirements: { index: true }
	};
}
