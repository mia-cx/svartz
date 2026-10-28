import type { MinimalThemeConfig } from '@svartz/theme-minimal';

/** The vault's `theme` settings for package docs. `routes.folders: "api"` reads well for module pages. */
export interface DocsThemeConfig extends MinimalThemeConfig {
	/** Shown as a badge beside the package name. */
	version?: string;
	/** Top-bar links, label → URL (GitHub, npm, changelog). */
	nav?: Record<string, string>;
}

/** Who the docs theme is, for both manifests. The release script keeps `version` in step with the package. */
export const docsIdentity = {
	id: '@svartz/theme-docs',
	name: 'docs',
	displayName: 'Svartz Docs',
	description: 'Package reference docs: modules, classes, interfaces, functions, and types.',
	version: '2.1.2',
};
