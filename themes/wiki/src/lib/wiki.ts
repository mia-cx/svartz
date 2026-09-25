import { isRecord, newestFirst, noteDate, type ExplorerNode } from '@svartz/ui';

type Properties = Readonly<Record<string, unknown>>;

interface Listable {
	readonly slug: string;
	readonly title: string;
	readonly tags: readonly string[];
	readonly properties: Properties;
	readonly modifiedAt?: Date;
	readonly publishedAt?: Date;
	readonly createdAt?: Date;
}

/**
 * The `infobox` frontmatter schema. Plugins that generate wiki pages emit this shape.
 *
 * ```yaml
 * infobox:
 *   image: station.svg
 *   caption: The station in September
 *   rows: { Location: Fence post }
 *   sections:
 *     - heading: Sensors
 *       rows: { Temperature: SHT45 }
 * ```
 */
export interface Infobox {
	readonly image?: string;
	readonly caption?: string;
	readonly sections: readonly InfoboxSection[];
}

export interface InfoboxSection {
	readonly heading?: string;
	readonly rows: readonly (readonly [label: string, value: string])[];
}

const scalar = (value: unknown) =>
	typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' ? String(value) : undefined;

function readRows(value: unknown): InfoboxSection['rows'] | undefined {
	if (!isRecord(value)) return undefined;
	const rows = Object.entries(value).map(([label, raw]) => [label, scalar(raw)] as const);
	return rows.every((row): row is readonly [string, string] => row[1] !== undefined) ? rows : undefined;
}

/** The note's infobox, or undefined when the frontmatter has none or is malformed. */
export function readInfobox(properties: Properties): Infobox | undefined {
	const raw = properties.infobox;
	if (!isRecord(raw)) return undefined;
	const lead = raw.rows === undefined ? [] : readRows(raw.rows);
	if (!lead) return undefined;
	const extra = Array.isArray(raw.sections) ? raw.sections : [];
	const sections: InfoboxSection[] = lead.length ? [{ heading: undefined, rows: lead }] : [];
	for (const section of extra) {
		const rows = isRecord(section) ? readRows(section.rows) : undefined;
		if (!rows) return undefined;
		sections.push({ heading: scalar((section as Properties).heading), rows });
	}
	if (sections.length === 0 && !raw.image) return undefined;
	return { image: scalar(raw.image), caption: scalar(raw.caption), sections };
}

/** A disambiguation line shown in italics above the article ("For X, see Y."). */
export const readHatnote = (properties: Properties) =>
	typeof properties.hatnote === 'string' ? properties.hatnote : undefined;

const collator = new Intl.Collator(undefined, { sensitivity: 'base', numeric: true });

/** Pages grouped under their first letter, A–Z; digits and symbols go under `#` first. */
export function alphabetical<T extends Listable>(entries: readonly T[]): { letter: string; entries: T[] }[] {
	const groups = new Map<string, T[]>();
	for (const entry of [...entries].sort((left, right) => collator.compare(left.title, right.title))) {
		const first = entry.title.charAt(0).toLocaleUpperCase();
		const letter = /\p{L}/u.test(first) ? first : '#';
		groups.set(letter, [...(groups.get(letter) ?? []), entry]);
	}
	return [...groups]
		.sort(([left], [right]) => (left === '#' ? -1 : right === '#' ? 1 : collator.compare(left, right)))
		.map(([letter, grouped]) => ({ letter, entries: grouped }));
}

/** Recent changes: dated pages grouped by calendar day (UTC), newest first. */
export function byDay<T extends Listable>(entries: readonly T[]): { date: string; entries: T[] }[] {
	const days = new Map<string, T[]>();
	for (const entry of newestFirst(entries)) {
		const date = noteDate(entry);
		if (!date) continue;
		const day = new Date(date).toISOString().slice(0, 10);
		days.set(day, [...(days.get(day) ?? []), entry]);
	}
	return [...days].map(([date, grouped]) => ({ date, entries: grouped }));
}

/** The note marked `featured: true`, for the main page. */
export const featuredNote = <T extends Listable>(entries: readonly T[]) =>
	entries.find((entry) => entry.properties.featured === true);

// --- Section menu ------------------------------------------------------------

/** Pages a dropdown shows before it links to the folder's full list. */
export const MENU_LIMIT = 12;
/** The bar, its dropdowns, and one level of flyouts, as on Fandom. */
const MENU_DEPTH = 2;

export interface MenuLink {
	readonly id: string;
	readonly title: string;
	readonly href: string;
	/** Set on a subfolder that opens as a flyout. */
	readonly folder?: MenuFolder;
}

export interface MenuFolder extends MenuLink {
	/** The folder's generated list page, where every page is listed. */
	readonly allHref: string;
	readonly items: readonly MenuLink[];
	/** Children past the limit, reachable through `allHref`. */
	readonly more: number;
}

/**
 * The header's section menu, from the vault's folders: each top-level folder is a
 * bar item, its notes and subfolders fill the dropdown, and a subfolder opens as a
 * flyout. Deeper folders are plain links. Notes at the vault root stay out.
 */
export function sectionMenu(
	tree: readonly ExplorerNode[],
	folders: readonly { readonly slug: string; readonly href: string }[],
	limit = MENU_LIMIT
): MenuFolder[] {
	const toFolder = (node: ExplorerNode, depth: number): MenuFolder => ({
		id: node.id,
		title: node.title,
		href: node.href,
		allHref: folders.find((folder) => `folder:${folder.slug}` === node.id)?.href ?? node.href,
		items: node.children.slice(0, limit).map((child): MenuLink =>
			child.isFolder && child.children.length > 0 && depth < MENU_DEPTH
				? { id: child.id, title: child.title, href: child.href, folder: toFolder(child, depth + 1) }
				: { id: child.id, title: child.title, href: child.href }
		),
		more: Math.max(0, node.children.length - limit)
	});
	return tree.filter((node) => node.isFolder).map((node) => toFolder(node, 1));
}

/**
 * Whether the page `slug` is a menu folder's note or sits anywhere inside it
 * (`folder:characters` holds `characters/lamplighters/mirelle-ashford`). Pages past
 * the dropdown limit or deeper than a flyout still count.
 */
export function inFolder(folderId: string, slug: string | undefined): boolean {
	const folder = folderId.replace(/^folder:/, '');
	return slug !== undefined && (slug === folder || slug.startsWith(`${folder}/`));
}
