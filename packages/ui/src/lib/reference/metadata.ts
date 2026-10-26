import { isRecord } from '../theme-settings.js';

type Properties = Readonly<Record<string, unknown>>;

const text = (value: unknown) => (typeof value === 'string' && value.trim() ? value.trim() : undefined);

/** How a page authenticates: `auth: bearer`, or `auth: { scheme, description, scopes }`. */
export interface ReferenceAuth {
	/** `none`, `bearer`, `basic`, or any label. */
	readonly scheme?: string;
	readonly description?: string;
	readonly scopes: readonly string[];
}

const SCHEME_LABELS: Readonly<Record<string, string>> = { none: 'None', bearer: 'Bearer token', basic: 'Basic auth' };

export function readAuth(raw: unknown): ReferenceAuth | undefined {
	const scheme = text(raw);
	if (scheme) return { scheme, scopes: [] };
	if (!isRecord(raw)) return undefined;
	const description = text(raw.description);
	const scopes = Array.isArray(raw.scopes) ? raw.scopes.filter((scope): scope is string => typeof scope === 'string') : [];
	const named = text(raw.scheme);
	if (!named && !description && scopes.length === 0) return undefined;
	return { scheme: named, description, scopes };
}

/** `Bearer token`, `None`, or the scheme as written. */
export const authLabel = (scheme: string) => SCHEME_LABELS[scheme] ?? scheme;

/** Where a page's subject is defined: a source file or line. */
export interface ReferenceSource {
	readonly label: string;
	readonly href: string;
}

const LINE = /^#L(\d+)(?:-L?(\d+))?$/;

/**
 * A short label for a source URL. A GitHub or GitLab file link reads as its
 * path and line (`src/mcp/tools.ts:23`); any other URL keeps its host and path.
 */
export function sourceLabel(href: string): string {
	let url: URL;
	try {
		url = new URL(href);
	} catch {
		return href;
	}
	const [, file] = url.pathname.match(/\/(?:-\/)?blob\/[^/]+\/(.+)$/) ?? [];
	const lines = url.hash.match(LINE);
	const where = lines ? `:${lines[1]}${lines[2] ? `–${lines[2]}` : ''}` : '';
	return file ? `${decodeURIComponent(file)}${where}` : `${url.host}${url.pathname}${where}`;
}

/** The page's `source`: a URL, `{ label, href }`, or a list of either. */
export function readSources(properties: Properties): ReferenceSource[] {
	const raw = properties.source;
	return (Array.isArray(raw) ? raw : [raw]).flatMap((item): ReferenceSource[] => {
		const href = text(item) ?? (isRecord(item) ? text(item.href) : undefined);
		if (!href) return [];
		return [{ label: (isRecord(item) ? text(item.label) : undefined) ?? sourceLabel(href), href }];
	});
}
