import type { SvartzPlugin, SvartzTheme, ThemeComponentLoader } from '@svartz/core';
import type { ThemeTokens } from '@svartz/ui';
import { SVARTZ_MARK_SVG, svartzSocialImage } from '@svartz/ui/brand';

/** Route prefixes. The pipeline reads the same keys. */
export interface DocsRouteConfig {
	/** Tag pages. Default `"tags"`. */
	tags?: string;
	/** Module pages (top-level folders). Default `"folders"`; `"api"` reads well. */
	folders?: string;
	/** Recently updated. Default `"feed"`. */
	feed?: string;
}

/** The vault's `theme` settings for package docs. */
export interface DocsThemeConfig {
	/** Design token overrides, above the theme's own (`accent`, `paper`, `radius-m`, …). */
	tokens?: ThemeTokens;
	routes?: DocsRouteConfig;
	/** Shown as a badge beside the package name. */
	version?: string;
	/** Top-bar links, label → URL (GitHub, npm, changelog). */
	nav?: Record<string, string>;
	comments?: Record<string, unknown>;
	footer?: { links?: Record<string, string> };
	[key: string]: unknown;
}

export interface DocsThemeModules {
	readonly layout: ThemeComponentLoader;
	readonly notFoundPage: ThemeComponentLoader;
	readonly moduleListPage: ThemeComponentLoader;
	readonly modulePage: ThemeComponentLoader;
	readonly tagListPage: ThemeComponentLoader;
	readonly tagPage: ThemeComponentLoader;
	readonly updatesPage: ThemeComponentLoader;
	readonly components: Readonly<Record<string, ThemeComponentLoader>>;
	readonly plugins?: readonly SvartzPlugin[];
}

export function createDocsTheme(modules: DocsThemeModules, config?: DocsThemeConfig): SvartzTheme {
	const tags = config?.routes?.tags ?? 'tags';
	const folders = config?.routes?.folders ?? 'folders';
	const feed = config?.routes?.feed ?? 'feed';

	return {
		id: '@svartz/theme-docs',
		displayName: 'Svartz Docs',
		description: 'Package reference docs: modules, classes, interfaces, functions, and types.',
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
			{ id: 'folders-index', pattern: `/${folders}`, layoutSlot: 'defaultPage', component: modules.moduleListPage, priority: 70 },
			{ id: 'folder', pattern: `/${folders}/:slug`, layoutSlot: 'folderPage', component: modules.modulePage, priority: 60 },
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
