import type { IndexEntry, JsonLdNode, PageStructuredData, ResolvedSiteConfig, SvartzTheme, VaultView } from '@svartz/core';
import { isoDate } from '../format.js';
import type { Breadcrumb } from '../navigation.js';

export interface PageGraphInput {
	readonly site: ResolvedSiteConfig;
	readonly vault: VaultView;
	readonly theme: Pick<SvartzTheme, 'structuredData'>;
	/** The note this page renders; list pages have none. */
	readonly entry?: IndexEntry;
	/** The trail the page shows, ending with the page itself. */
	readonly crumbs: readonly Breadcrumb[];
	/** The page's canonical URL. */
	readonly url: string;
	readonly image?: string;
	/** Resolves a site path to an absolute URL. */
	readonly absolute: (path: string) => string;
}

/**
 * A page's JSON-LD graph, from what the page shows: the site's `WebSite` on every page, then a note's
 * `Article` and the page's breadcrumb trail as the theme maps them. Properties the page has no value for
 * are left out.
 */
export function pageGraph({ site, vault, theme, entry, crumbs, url, image, absolute }: PageGraphInput): JsonLdNode[] {
	const website: JsonLdNode = {
		'@type': 'WebSite',
		name: site.title,
		url: absolute(`${vault.routes.mountPath}/`),
		description: site.description
	};
	const breadcrumbs: JsonLdNode | undefined = crumbs.length
		? {
				'@type': 'BreadcrumbList',
				itemListElement: crumbs.map((crumb, index) => ({
					'@type': 'ListItem',
					position: index + 1,
					name: crumb.title,
					// The trail ends on this page, whose crumb can link elsewhere: a folder listing's links its folder note.
					item: index === crumbs.length - 1 ? url : absolute(crumb.href)
				}))
			}
		: undefined;
	const article: JsonLdNode | undefined = entry && {
		'@type': 'Article',
		headline: entry.title,
		description: entry.description,
		datePublished: isoDate(entry.publishedAt ?? entry.createdAt),
		dateModified: isoDate(entry.modifiedAt),
		url,
		author: site.author ? { '@type': 'Person', name: site.author } : undefined,
		image
	};
	const defaults: PageStructuredData = { article, breadcrumbs };
	const nodes = theme.structuredData?.(defaults, { entry, vault }) ?? defaults;
	return [website, nodes.article, nodes.breadcrumbs].filter((node) => node !== undefined);
}

/** The graph as one `application/ld+json` script. `<` is escaped so note text can never close the tag. */
export const jsonLdScript = (graph: readonly JsonLdNode[]) =>
	`<script type="application/ld+json">${JSON.stringify({ '@context': 'https://schema.org', '@graph': graph }).replace(/</g, '\\u003c')}</script>`;
