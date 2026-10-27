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

/** A folder in the sidebar: its own pages, then its subfolders, each titled by its own name. */
export interface ReferenceNavFolder<T> {
	readonly slug: string;
	readonly title: string;
	/** The folder's own note, when it has one. */
	readonly href?: string;
	readonly links: ReferenceNavLink<T>[];
	readonly folders: ReferenceNavFolder<T>[];
}

/** A top-level folder, or `""` for pages at the vault root. */
export interface ReferenceNavSection<T> extends ReferenceNavFolder<T> {
	/** Holds reference pages (schemas, operations, tools), not only guides. */
	readonly reference: boolean;
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

const parentOf = (slug: string) => slug.slice(0, Math.max(slug.lastIndexOf('/'), 0));

/** Every link in a folder and its subfolders, in sidebar order. */
const linksIn = <T>(folder: ReferenceNavFolder<T>): ReferenceNavLink<T>[] => [...folder.links, ...folder.folders.flatMap(linksIn)];

/**
 * The sidebar: one section per top-level folder, guides before reference
 * sections. Each folder lists its own pages, then its subfolders, at any
 * depth. A folder's own note links the folder instead of listing in it.
 * `itemOf` gives a reference page's badge and label; other pages list as
 * guides. `order` frontmatter comes first at every level: a page's own, or a
 * folder's folder note's.
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
			// Each folder's own links, with every folder between it and the section.
			const contents = new Map<string, ReferenceNavLink<T>[]>([[section.slug, []]]);
			const reach = (slug: string) => {
				for (let folder = slug; !contents.has(folder); folder = parentOf(folder)) contents.set(folder, []);
				return contents.get(slug)!;
			};
			for (const entry of section.entries) {
				const home = folderNotes.get(entry);
				if (home !== undefined && home !== section.slug) {
					// The folder note links its folder, even when the folder holds nothing else.
					reach(home);
					continue;
				}
				reach(layout.folderOf(entry.slug) ?? section.slug).push({ entry, item: itemOf(entry) ?? guideNavItem(entry) });
			}
			const build = (slug: string): ReferenceNavFolder<T> => ({
				slug,
				title: titleOf(slug),
				href: layout.noteOf(slug)?.href,
				links: contents.get(slug)!.sort(compareLinks),
				folders: [...contents.keys()]
					.filter((child) => child !== slug && parentOf(child) === slug)
					.map(build)
					.sort((left, right) => byOrder(orderOf(layout.noteOf(left.slug)), orderOf(layout.noteOf(right.slug))) || collator.compare(left.title, right.title))
			});
			const root = build(section.slug);
			return {
				...root,
				title: section.slug ? section.title : 'Overview',
				href: section.href,
				reference: linksIn(root).some((link) => link.item.sort[0] < GUIDE_RANK)
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
 * against the label, the page title, the badge, and every folder and section
 * title above the page. Folders keep only what matches below them, so each
 * match shows with its path. An empty query keeps everything.
 */
export function filterReferenceNav<T extends NavEntry>(sections: readonly ReferenceNavSection<T>[], query: string): ReferenceNavSection<T>[] {
	const words = query.toLocaleLowerCase().split(/\s+/).filter(Boolean);
	if (words.length === 0) return [...sections];
	const prune = <F extends ReferenceNavFolder<T>>(folder: F, trail: readonly string[]): F | undefined => {
		const path = [...trail, folder.title];
		const links = folder.links.filter((link) => {
			const haystack = [link.item.label, link.entry.title, link.item.badge?.label, ...path].join(' ').toLocaleLowerCase();
			return words.every((word) => haystack.includes(word));
		});
		const children = folder.folders.flatMap((child) => prune(child, path) ?? []);
		return links.length || children.length ? { ...folder, links, folders: children } : undefined;
	};
	return sections.flatMap((section) => prune(section, []) ?? []);
}

/** Every page in the sidebar, in order. */
export const navLinks = <T>(sections: readonly ReferenceNavFolder<T>[]) => sections.flatMap(linksIn);

/** A stop in reading order: a folder's overview, or a page. */
export interface ReferenceNavStop {
	readonly title: string;
	readonly href: string;
}

/**
 * The sidebar in reading order, for previous and next links: each section
 * and folder's own note, then its pages, then its subfolders.
 */
export function readingOrder<T extends NavEntry>(sections: readonly ReferenceNavSection<T>[]): ReferenceNavStop[] {
	const walk = (folder: ReferenceNavFolder<T>): ReferenceNavStop[] => [
		...(folder.href ? [{ title: folder.title, href: folder.href }] : []),
		...folder.links.map(({ entry }) => ({ title: entry.title, href: entry.href })),
		...folder.folders.flatMap(walk)
	];
	return sections.flatMap(walk);
}

/** The folders, below their section, that lead to the page or folder overview at `href`, outermost first. */
export function folderTrail<T extends NavEntry>(sections: readonly ReferenceNavSection<T>[], href: string): string[] {
	const search = (folder: ReferenceNavFolder<T>, trail: readonly string[]): string[] | undefined => {
		if (folder.href === href || folder.links.some(({ entry }) => entry.href === href)) return [...trail];
		for (const child of folder.folders) {
			const found = search(child, [...trail, child.slug]);
			if (found) return found;
		}
		return undefined;
	};
	for (const section of sections) {
		const found = search(section, []);
		if (found) return found;
	}
	return [];
}
