import type { MinimalThemeConfig } from '@svartz/theme-minimal';

/** The vault's `theme` settings for the blog: minimal's, plus header links. */
export interface BlogThemeConfig extends MinimalThemeConfig {
	/** Header links, label → URL. Defaults to Archive and Tags. */
	nav?: Record<string, string>;
}

/** Who the blog is, in both the build and runtime extensions. */
export const blogIdentity = {
	id: '@svartz/theme-blog',
	name: 'blog',
	displayName: 'Svartz Blog',
	description: 'A blog: a post grid with tag filters, an archive, and long-form reading.',
	version: '2.0.0',
} as const;
