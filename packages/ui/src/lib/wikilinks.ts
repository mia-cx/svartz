export interface LinkSegment {
	readonly text: string;
	readonly href?: string;
}

const WIKILINK = /\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|([^\]]+))?\]\]/g;
const normalize = (value: string) => value.toLowerCase().replace(/[\s_]+/g, '-');

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
