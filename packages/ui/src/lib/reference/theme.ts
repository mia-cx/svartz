import type { SvartzPlugin, SvartzTheme, ThemeComponentLoader } from '@svartz/core';
import { SVARTZ_MARK_SVG, svartzSocialImage } from '../brand.js';
import type { ThemeTokens } from '../theme-tokens.js';

/** Route prefixes. The pipeline reads the same keys. */
export interface ReferenceRouteConfig {
	/** Tag pages. Default `"tags"`. */
	tags?: string;
	/** Section pages (top-level folders). Default `"folders"`; `"reference"` reads well. */
	folders?: string;
	/** Recently updated. Default `"feed"`. */
	feed?: string;
}

/** The vault's `theme` settings every reference theme reads. Renderers read their own keys too. */
export interface ReferenceThemeConfig {
	/** Design token overrides, above the theme's own (`accent`, `paper`, `radius-m`, …). */
	tokens?: ThemeTokens;
	routes?: ReferenceRouteConfig;
	/** Shown as a badge beside the site name. */
	version?: string;
	/** Top-bar links, label → URL (status page, changelog, support). */
	nav?: Record<string, string>;
	comments?: Record<string, unknown>;
	footer?: { links?: Record<string, string> };
	[key: string]: unknown;
}

/** Who the theme is: a first-party preset, or a host's own composition. */
export interface ReferenceThemeIdentity {
	readonly id: string;
	readonly displayName?: string;
	readonly description?: string;
	/** Default `"1.0.0"`. */
	readonly version?: string;
}

/** The shell's layout and list pages, eager for the runtime or lazy for the build. */
export interface ReferenceThemeModules {
	readonly layout: ThemeComponentLoader;
	readonly notFoundPage: ThemeComponentLoader;
	readonly referencePage: ThemeComponentLoader;
	readonly resourcePage: ThemeComponentLoader;
	readonly tagListPage: ThemeComponentLoader;
	readonly tagPage: ThemeComponentLoader;
	readonly updatesPage: ThemeComponentLoader;
	readonly components: Readonly<Record<string, ThemeComponentLoader>>;
	readonly plugins?: readonly SvartzPlugin[];
	readonly hooks?: Readonly<Record<string, unknown>>;
}

/** Build a reference theme manifest. Every reference theme shares these routes, so build and runtime manifests agree. */
export function createReferenceTheme(
	identity: ReferenceThemeIdentity,
	modules: ReferenceThemeModules,
	config?: ReferenceThemeConfig
): SvartzTheme {
	const tags = config?.routes?.tags ?? 'tags';
	const folders = config?.routes?.folders ?? 'folders';
	const feed = config?.routes?.feed ?? 'feed';

	return {
		id: identity.id,
		displayName: identity.displayName ?? identity.id,
		description: identity.description,
		version: identity.version ?? '1.0.0',
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
		hooks: modules.hooks,
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
