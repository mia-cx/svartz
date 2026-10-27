import type { ThemeTokens } from '../theme-tokens.js';

/** Route prefixes. The pipeline reads the same keys. */
export interface ReferenceRouteConfig {
	/** Tag pages. Default `"tags"`. */
	tags?: string;
	/** Folder pages. Default `"folders"`; `"reference"` reads well. */
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

/** Who a reference theme is. */
export interface ReferenceThemeIdentity {
	readonly id: string;
	/** The short name `theme:` frontmatter can use: `api-docs`. */
	readonly name?: string;
	readonly displayName?: string;
	readonly description?: string;
	readonly version?: string;
}
