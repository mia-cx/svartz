export type LinkKind = 'internal' | 'external' | 'anchor' | 'heading-anchor' | 'footnote';

type LinkAttributes = Readonly<Record<string, string | boolean>>;

const SCHEME = /^[a-z][a-z\d+.-]*:/i;

/**
 * Classify a link in rendered note content. Internal links get previews and the
 * internal style; heading anchors and footnote links stay quiet.
 */
export function classifyLink(href: string | undefined, attributes: LinkAttributes = {}): LinkKind {
	if (String(attributes.class ?? '').split(/\s+/).includes('heading-anchor')) return 'heading-anchor';
	if ('data-footnote-ref' in attributes || 'data-footnote-backref' in attributes) return 'footnote';
	if (!href || href.startsWith('#')) return 'anchor';
	if (SCHEME.test(href) || href.startsWith('//')) return 'external';
	return 'internal';
}
