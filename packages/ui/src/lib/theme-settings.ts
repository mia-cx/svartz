/** Giscus settings a theme passes to `Comments`. */
export interface CommentsSettings {
	readonly repo: string;
	readonly repoId: string;
	readonly category: string;
	readonly categoryId: string;
	readonly mapping?: 'url' | 'title' | 'og:title' | 'specific' | 'number' | 'pathname';
	readonly term?: string;
	readonly strict?: boolean;
	readonly reactionsEnabled?: boolean;
	readonly inputPosition?: 'top' | 'bottom';
	readonly lang?: string;
	readonly lightTheme?: string;
	readonly darkTheme?: string;
}

export interface SettingsLink {
	readonly label: string;
	readonly href: string;
}

/** Settings every first-party theme reads from the vault's `theme` config. */
export interface ThemeSettings {
	readonly comments?: CommentsSettings;
	readonly footerLinks: readonly SettingsLink[];
	/** Top navigation, for themes with a header (`nav: { Label: '/url/' }`). */
	readonly navLinks: readonly SettingsLink[];
}

type Loose = Readonly<Record<string, unknown>>;

export const isRecord = (value: unknown): value is Loose => typeof value === 'object' && value !== null;
const text = (value: unknown) => (typeof value === 'string' && value.trim() ? value : undefined);

/** A `{ Label: 'url' }` map from user config as ordered links; non-string URLs are dropped. */
export function readLinks(value: unknown): SettingsLink[] {
	return Object.entries(isRecord(value) ? value : {})
		.filter((link): link is [string, string] => typeof link[1] === 'string')
		.map(([label, href]) => ({ label, href }));
}

/**
 * Read the vault's `theme` settings. They come from user config, so every field
 * is checked; anything malformed is ignored rather than rendered.
 */
export function themeSettings(themeConfig: Loose | undefined): ThemeSettings {
	const comments = isRecord(themeConfig?.comments) ? themeConfig.comments : undefined;
	const ids = comments && {
		repo: text(comments.repo),
		repoId: text(comments.repoId),
		category: text(comments.category),
		categoryId: text(comments.categoryId)
	};
	const commentsEnabled =
		comments && comments.enabled !== false && ids && Object.values(ids).every(Boolean);
	const footer = isRecord(themeConfig?.footer) ? themeConfig.footer : undefined;

	return {
		comments: commentsEnabled ? ({ ...comments, ...ids } as CommentsSettings) : undefined,
		footerLinks: readLinks(footer?.links),
		navLinks: readLinks(themeConfig?.nav)
	};
}
