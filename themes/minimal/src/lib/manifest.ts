import type { SocialImageMetadata, SvartzTheme, ThemeComponentLoader } from '@svartz/core';

const escapeXml = (value: string) => value.replace(/[&<>"']/g, (character) => ({
	'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;'
})[character]!);

/** Plain first-party preview; themes can replace the SVG template. */
const socialImage = ({ title, description, siteTitle }: SocialImageMetadata): string => `
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <rect width="1200" height="630" fill="#171717"/>
  <text x="72" y="116" fill="#aaa" font-family="sans-serif" font-size="32">${escapeXml(siteTitle.slice(0, 60))}</text>
  <text x="72" y="310" fill="#fff" font-family="sans-serif" font-size="68" font-weight="bold">${escapeXml(title.slice(0, 32))}</text>
  <text x="72" y="382" fill="#fff" font-family="sans-serif" font-size="68" font-weight="bold">${escapeXml(title.slice(32, 64))}</text>
  <text x="72" y="510" fill="#bbb" font-family="sans-serif" font-size="28">${escapeXml((description ?? '').slice(0, 75))}</text>
</svg>`;

const faviconSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64"><rect width="64" height="64" rx="12" fill="#171717"/><text x="32" y="46" text-anchor="middle" fill="#fff" font-family="sans-serif" font-size="42" font-weight="bold">S</text></svg>';

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
		socialImage,
		faviconSvg,
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
