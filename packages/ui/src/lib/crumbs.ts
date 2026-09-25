import type { IndexEntry, VaultView } from '@svartz/core';
import { buildBreadcrumbs, type Breadcrumb } from './navigation.js';
import type { ThemeRouteMatch } from './runtime/theme-props.js';

/** The URL of a tag's page, including the mount path, for tags the index knows or not. */
export const tagHrefFor = (vault: VaultView) => (tag: string) =>
	vault.tags.find((candidate) => candidate.slug === tag)?.href ?? `${vault.routes.mountPath}/tags/${tag}/`;

const LIST_TITLES: Record<string, string> = {
	'tags-index': 'Tags',
	tag: 'Tags',
	'folders-index': 'Folders',
	feed: 'Recent notes'
};

/**
 * Breadcrumbs for any page, ending with the page itself (Quartz's `showCurrentPage`).
 * List pages walk through their index route; home and missing pages have none.
 * Themes with other list routes pass their own `titles`.
 */
export function pageCrumbs(
	vault: VaultView,
	entry: IndexEntry | undefined,
	match: ThemeRouteMatch | undefined,
	titles: Readonly<Record<string, string>> = LIST_TITLES
): Breadcrumb[] {
	const home = `${vault.routes.mountPath}/`;
	if (entry) {
		return entry.slug === 'index' ? [] : buildBreadcrumbs(entry.slug, vault.entries, home, vault.folders);
	}
	const id = match?.route.id;
	const slug = match?.params.slug;
	if (id === 'folder' && slug) return buildBreadcrumbs(slug, vault.entries, home, vault.folders);
	const title = id ? titles[id] : undefined;
	if (!title) return [];

	// `/tags/:slug` and `/tags` share a prefix; detail pages link back to the index.
	const prefix = match!.route.pattern.replace(/\/:slug$/, '');
	const crumbs: Breadcrumb[] = [
		{ title: 'Home', href: home },
		{ title, href: `${vault.routes.mountPath}${prefix}/` }
	];
	if (id === 'tag' && slug) {
		const tag = vault.tags.find((candidate) => candidate.slug === slug);
		crumbs.push({ title: tag?.title ?? slug, href: tagHrefFor(vault)(slug) });
	}
	return crumbs;
}
