/** Giscus settings the minimal theme passes to `Comments`. */
export interface MinimalComments {
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

export interface MinimalSettings {
	readonly comments?: MinimalComments;
	readonly footerLinks: readonly { readonly label: string; readonly href: string }[];
}

type Loose = Readonly<Record<string, unknown>>;

const isRecord = (value: unknown): value is Loose => typeof value === 'object' && value !== null;
const text = (value: unknown) => (typeof value === 'string' && value.trim() ? value : undefined);

/**
 * Read the vault's `theme` settings. They come from user config, so every field
 * is checked; anything malformed is ignored rather than rendered.
 */
export function minimalConfig(themeConfig: Loose | undefined): MinimalSettings {
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
	const links = isRecord(footer?.links) ? footer.links : {};

	return {
		comments: commentsEnabled ? ({ ...comments, ...ids } as MinimalComments) : undefined,
		footerLinks: Object.entries(links)
			.filter((link): link is [string, string] => typeof link[1] === 'string')
			.map(([label, href]) => ({ label, href }))
	};
}
