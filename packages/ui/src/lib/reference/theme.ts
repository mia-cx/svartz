import type { ThemeTokens } from '../theme-tokens.js';
import type { VersionStatus } from './versions.js';

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
	/** Shown as a badge beside the site name. With `versions`, the build sets it to the version each page belongs to. */
	version?: string;
	/**
	 * The versions the site documents, replacing the `version` badge with a picker. The one with status `latest` is the
	 * vault as it stands, at the unversioned URLs; every other is the vault's folder at a git `ref`, at `/<id>/`.
	 */
	versions?: readonly ReferenceVersionConfig[];
	/** Top-bar links, label → URL (status page, changelog, support). */
	nav?: Record<string, string>;
	comments?: Record<string, unknown>;
	footer?: { links?: Record<string, string> };
	[key: string]: unknown;
}

/** One documented version: `{ id: "2026-01", ref: "api/2026-01", status: "supported" }`. */
export interface ReferenceVersionConfig {
	/** Its URL segment. */
	id: string;
	/** The git tag or branch holding its docs. The latest version takes none. */
	ref?: string;
	/** Default `"supported"`. A `deprecated` version's pages point readers to the latest version. */
	status?: VersionStatus;
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
