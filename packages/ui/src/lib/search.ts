import MiniSearch, { type Options, type SearchResult } from 'minisearch';

/** A published note as the artifact producer stores it for search. */
export interface SearchDocument {
	readonly id: string;
	readonly slug: string;
	readonly href?: string;
	readonly title: string;
	readonly description?: string;
	readonly content?: string;
	readonly tags?: readonly string[];
}

export interface SearchHit {
	readonly document: SearchDocument;
	readonly href: string;
	/** Matched query terms, for highlighting. */
	readonly terms: readonly string[];
}

export interface SearchQuery {
	readonly tag: string | undefined;
	readonly text: string;
}

export type SearchOptions = Pick<Options, 'fields' | 'storeFields' | 'idField'>;

const MAX_RESULTS = 8;
const MIN_QUERY_LENGTH = 2;

/** `#guides setup` searches notes tagged `guides` for "setup". */
export function parseSearchQuery(raw: string): SearchQuery {
	const trimmed = raw.trim();
	const match = /^#(\S+)\s*(.*)$/.exec(trimmed);
	return match ? { tag: match[1], text: match[2]!.trim() } : { tag: undefined, text: trimmed };
}

export interface TextSegment {
	readonly text: string;
	readonly match: boolean;
}

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Split text into matched and plain runs, so results render highlights without HTML. */
export function highlight(text: string, terms: readonly string[]): TextSegment[] {
	const usable = terms.filter(Boolean);
	if (usable.length === 0) return [{ text, match: false }];
	const pattern = new RegExp(`(${usable.map(escapeRegExp).join('|')})`, 'gi');
	return text
		.split(pattern)
		.filter(Boolean)
		.map((part) => ({ text: part, match: usable.some((term) => term.toLowerCase() === part.toLowerCase()) }));
}

/** About `words` words of `content`, centred on the first matched term. */
export function excerpt(content: string, terms: readonly string[], words = 30): string {
	const all = content.split(/\s+/).filter(Boolean);
	if (all.length <= words) return all.join(' ');
	const lowered = terms.map((term) => term.toLowerCase());
	const hit = Math.max(0, all.findIndex((word) => lowered.some((term) => word.toLowerCase().includes(term))));
	const start = Math.max(0, Math.min(hit - Math.floor(words / 3), all.length - words));
	const end = start + words;
	return `${start > 0 ? '… ' : ''}${all.slice(start, end).join(' ')}${end < all.length ? ' …' : ''}`;
}

/**
 * Build a query function over the vault's search index. `documents` carries final
 * URLs; the stored index may predate the deployment base, so hrefs come from it.
 */
export function createSearch(
	documents: readonly SearchDocument[],
	options: SearchOptions,
	storedIndex?: unknown
) {
	const byId = new Map(documents.map((document) => [document.id, document]));
	let engine: MiniSearch | undefined;
	const load = () => {
		if (engine) return engine;
		if (storedIndex) {
			engine = MiniSearch.loadJS(storedIndex as Parameters<typeof MiniSearch.loadJS>[0], options);
		} else {
			engine = new MiniSearch(options);
			engine.addAll(documents as SearchDocument[]);
		}
		return engine;
	};

	const toHit = (document: SearchDocument, terms: readonly string[]): SearchHit => ({
		document,
		href: document.href ?? (document.slug === 'index' ? '/' : `/${document.slug}/`),
		terms
	});

	return (raw: string): SearchHit[] => {
		const { tag, text } = parseSearchQuery(raw);
		const hasTag = (document: SearchDocument) =>
			!tag || (document.tags ?? []).some((candidate) => candidate === tag || candidate.startsWith(`${tag}/`));

		if (tag && !text) {
			return documents.filter(hasTag).slice(0, MAX_RESULTS).map((document) => toHit(document, []));
		}
		if (text.length < MIN_QUERY_LENGTH) return [];

		return load()
			.search(text, { prefix: true, fuzzy: 0.2, boost: { title: 3, tags: 2 } })
			.map((result: SearchResult) => ({ result, document: byId.get(String(result.id)) }))
			.filter((hit): hit is { result: SearchResult; document: SearchDocument } =>
				Boolean(hit.document && hasTag(hit.document))
			)
			.slice(0, MAX_RESULTS)
			.map(({ result, document }) => toHit(document, result.terms));
	};
}
