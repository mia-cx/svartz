import { isRecord, newestFirst, noteDate } from '@svartz/ui';

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

export interface Segment {
	readonly text: string;
	readonly href?: string;
}

const WIKILINK = /\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|([^\]]+))?\]\]/g;
const normalize = (value: string) => value.toLowerCase().replace(/[\s_]+/g, '-');

/**
 * Frontmatter isn't run through the Markdown pipeline, so infobox values keep raw
 * `[[links]]`. Resolve them against published notes by title or file name.
 */
export function wikilinkSegments(
	value: string,
	entries: readonly { readonly slug: string; readonly title: string; readonly href: string }[]
): Segment[] {
	const segments: Segment[] = [];
	let last = 0;
	for (const match of value.matchAll(WIKILINK)) {
		if (match.index > last) segments.push({ text: value.slice(last, match.index) });
		const target = normalize(match[1]!.trim());
		const note = entries.find(
			(entry) => normalize(entry.title) === target || entry.slug.split('/').at(-1) === target || entry.slug === target
		);
		const text = match[2]?.trim() ?? match[1]!.trim();
		segments.push(note ? { text, href: note.href } : { text });
		last = match.index + match[0].length;
	}
	if (last < value.length) segments.push({ text: value.slice(last) });
	return segments;
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
