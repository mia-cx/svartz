import { topLevelSections } from '../listing.js';
import { folderLayout, orderOf, type UiFolderEntry } from '../navigation.js';
import type { ReferenceNavItem } from './renderers.js';

interface NavEntry {
	readonly slug: string;
	readonly title: string;
	readonly path?: string;
	readonly href: string;
	/** Frontmatter. The sidebar reads `order` from it. */
	readonly properties?: Readonly<Record<string, unknown>>;
}

type NavFolder = Pick<UiFolderEntry, 'slug' | 'title' | 'href' | 'noteSlugs' | 'noteSlug'>;

export interface ReferenceNavLink<T> {
	readonly entry: T;
	readonly item: ReferenceNavItem;
}

/** The pages of one folder inside a section. The section's own pages have no title. */
export interface ReferenceNavGroup<T> {
	readonly slug: string;
	/** Folder titles below the section, joined: `Public API / Authentication`. */
	readonly title?: string;
	/** The folder's own note, when it has one. */
	readonly href?: string;
	readonly links: ReferenceNavLink<T>[];
}

export interface ReferenceNavSection<T> {
	/** The top-level folder, or `""` for pages at the vault root. */
	readonly slug: string;
	readonly title: string;
	readonly href?: string;
	/** Holds reference pages (schemas, operations, tools), not only guides. */
	readonly reference: boolean;
	readonly groups: ReferenceNavGroup<T>[];
}

const collator = new Intl.Collator(undefined, { sensitivity: 'base', numeric: true });
const GUIDE_RANK = 2;

/** `order` frontmatter sorts first, lowest first; pages and folders without one follow. */
const byOrder = (left: number | undefined, right: number | undefined) => (left ?? Infinity) - (right ?? Infinity) || 0;

const compareLinks = <T extends NavEntry>(left: ReferenceNavLink<T>, right: ReferenceNavLink<T>) => {
	const [leftRank, leftKey, leftOrder] = left.item.sort;
	const [rightRank, rightKey, rightOrder] = right.item.sort;
	return (
		byOrder(orderOf(left.entry), orderOf(right.entry)) ||
		leftRank - rightRank ||
		collator.compare(leftKey, rightKey) ||
		leftOrder - rightOrder
	);
};

/** How a guide lists: its title, after every reference page. */
export const guideNavItem = (entry: Pick<NavEntry, 'title'>): ReferenceNavItem => ({ label: entry.title, sort: [GUIDE_RANK, entry.title, 0] });

/**
 * The sidebar: one section per top-level folder, guides before reference
 * sections, and inside each section one group per folder. A folder's own note
 * links its group instead of listing in it. `itemOf` gives a reference page's
 * badge and label; other pages list as guides. `order` frontmatter comes
 * first at every level: a page's own, or for a section or group its folder
 * note's.
 */
export function referenceNav<T extends NavEntry>(
	entries: readonly T[],
	folders: readonly NavFolder[],
	itemOf: (entry: T) => ReferenceNavItem | undefined
): ReferenceNavSection<T>[] {
	const layout = folderLayout(entries, folders);
	const folderNotes = new Map(folders.flatMap((folder) => {
		const note = layout.noteOf(folder.slug);
		return note ? [[note, folder.slug] as const] : [];
	}));
	const titleOf = (slug: string) => folders.find((folder) => folder.slug === slug)?.title ?? slug.split('/').at(-1)!;

	return topLevelSections(entries, folders)
		.map((section): ReferenceNavSection<T> => {
			const groups = new Map<string, ReferenceNavLink<T>[]>([[section.slug, []]]);
			for (const entry of section.entries) {
				const home = folderNotes.get(entry);
				if (home !== undefined && home !== section.slug) {
					// The folder note heads its group, even when the folder holds nothing else.
					if (!groups.has(home)) groups.set(home, []);
					continue;
				}
				const folder = layout.folderOf(entry.slug) ?? section.slug;
				const links = groups.get(folder) ?? [];
				groups.set(folder, links);
				links.push({ entry, item: itemOf(entry) ?? guideNavItem(entry) });
			}
			const nested = (slug: string) => (section.slug ? slug.slice(section.slug.length + 1) : slug).split('/');
			return {
				...section,
				title: section.slug ? section.title : 'Overview',
				reference: [...groups.values()].some((links) => links.some((link) => link.item.sort[0] < GUIDE_RANK)),
				groups: [...groups]
					.filter(([slug, links]) => slug === section.slug ? links.length > 0 : true)
					.sort(([left], [right]) =>
						left === section.slug
							? -1
							: right === section.slug
								? 1
								: byOrder(orderOf(layout.noteOf(left)), orderOf(layout.noteOf(right))) || collator.compare(left, right)
					)
					.map(([slug, links]) => ({
						slug,
						title:
							slug === section.slug
								? undefined
								: nested(slug)
										.map((_, depth, parts) => titleOf([section.slug, ...parts.slice(0, depth + 1)].filter(Boolean).join('/')))
										.join(' / '),
						href: slug === section.slug ? undefined : layout.noteOf(slug)?.href,
						links: links.sort(compareLinks)
					}))
			};
		})
		.sort(
			(left, right) =>
				byOrder(orderOf(layout.noteOf(left.slug)), orderOf(layout.noteOf(right.slug))) ||
				Number(left.reference) - Number(right.reference) ||
				collator.compare(left.title, right.title)
		);
}

/**
 * The sidebar narrowed to pages matching every word of `query`, checked
 * against the label, the page title, the badge, and the group and section
 * titles. An empty query keeps everything.
 */
export function filterReferenceNav<T extends NavEntry>(sections: readonly ReferenceNavSection<T>[], query: string): ReferenceNavSection<T>[] {
	const words = query.toLocaleLowerCase().split(/\s+/).filter(Boolean);
	if (words.length === 0) return [...sections];
	return sections.flatMap((section) => {
		const groups = section.groups.flatMap((group) => {
			const links = group.links.filter((link) => {
				const haystack = [link.item.label, link.entry.title, link.item.badge?.label, group.title, section.title]
					.join(' ')
					.toLocaleLowerCase();
				return words.every((word) => haystack.includes(word));
			});
			return links.length ? [{ ...group, links }] : [];
		});
		return groups.length ? [{ ...section, groups }] : [];
	});
}

/** Every page in the sidebar, in order. */
export const navLinks = <T>(sections: readonly ReferenceNavSection<T>[]) =>
	sections.flatMap((section) => section.groups.flatMap((group) => group.links));
