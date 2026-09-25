export type LinkKind = 'internal' | 'file' | 'external' | 'anchor' | 'heading-anchor' | 'footnote';

type LinkAttributes = Readonly<Record<string, string | boolean>>;

const SCHEME = /^[a-z][a-z\d+.-]*:/i;
// A last path segment with an extension (other than .html) is an attachment.
const FILE_PATH = /\.(?!html?$)[a-z\d]+$/i;

/**
 * Classify a link in rendered note content. Internal links get previews and the
 * internal style; files, heading anchors, and footnote links stay quiet.
 */
export function classifyLink(href: string | undefined, attributes: LinkAttributes = {}): LinkKind {
	if (String(attributes.class ?? '').split(/\s+/).includes('heading-anchor')) return 'heading-anchor';
	if ('data-footnote-ref' in attributes || 'data-footnote-backref' in attributes) return 'footnote';
	if (!href || href.startsWith('#')) return 'anchor';
	if (SCHEME.test(href) || href.startsWith('//')) return 'external';
	const path = href.split(/[?#]/)[0]!;
	return FILE_PATH.test(path.split('/').at(-1) ?? '') ? 'file' : 'internal';
}
