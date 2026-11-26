export interface LinkSegment {
	readonly text: string;
	readonly href?: string;
}

const WIKILINK = /\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|([^\]]+))?\]\]/g;
/** A target as written, case and spaces aside. */
const exact = (value: string) => value.toLowerCase().replace(/\s+/g, '-');
/** Looser still: any run of spaces and `_` reads as one `-`, as in a slug made from `CONTRACT_VERSION` or `Foo_ Bar`. */
const loose = (value: string) => value.toLowerCase().replace(/[\s_]+/g, '-');

/**
 * Frontmatter isn't run through the Markdown pipeline, so values like
 * `Home: "[[Vessa]], Lower Wards"` keep raw `[[links]]`. Split such a value into
 * text and linked segments, resolving targets against published notes by title,
 * file name, or slug. Unresolved links become plain text.
 */
export function wikilinkSegments(
	value: string,
	entries: readonly { readonly slug: string; readonly title: string; readonly href: string }[]
): LinkSegment[] {
	const segments: LinkSegment[] = [];
	let last = 0;
	for (const match of value.matchAll(WIKILINK)) {
		if (match.index > last) segments.push({ text: value.slice(last, match.index) });
		const raw = match[1]!.trim();
		// An exact match wins, so `[[api/foo-bar]]` finds `api/foo-bar` even when `api/foo_bar` comes first.
		const find = (key: (value: string) => string) => entries.find(
			(entry) => key(entry.title) === key(raw) || key(entry.slug.split('/').at(-1)!) === key(raw) || key(entry.slug) === key(raw)
		);
		const note = find(exact) ?? find(loose);
		const text = match[2]?.trim() ?? match[1]!.trim();
		segments.push(note ? { text, href: note.href } : { text });
		last = match.index + match[0].length;
	}
	if (last < value.length) segments.push({ text: value.slice(last) });
	return segments;
}
