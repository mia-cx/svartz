/**
 * Page previews for link hovers and search. A theme marks the part of its page
 * worth previewing with `data-sv-preview`; previews fetch the target URL and
 * clone those nodes. Works for static output and SvelteKit hosts alike.
 */
export const PREVIEW_ATTRIBUTE = 'data-sv-preview';

const cache = new Map<string, Promise<Element[]>>();

function withoutHash(href: string): string {
	const url = new URL(href, location.href);
	url.hash = '';
	return url.href;
}

async function load(url: string): Promise<Element[]> {
	const response = await fetch(url);
	if (!response.ok || !response.headers.get('content-type')?.includes('text/html')) return [];
	const page = new DOMParser().parseFromString(await response.text(), 'text/html');
	return [...page.querySelectorAll(`[${PREVIEW_ATTRIBUTE}]`)];
}

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Wrap each occurrence of `terms` in `root`'s text in `<mark class="sv-search-match">`,
 * skipping code, and return the first mark so the caller can scroll to it.
 */
export function markTerms(root: Element, terms: readonly string[]): HTMLElement | undefined {
	const usable = terms.filter(Boolean);
	if (usable.length === 0) return undefined;
	const pattern = new RegExp(`(${usable.map(escapeRegExp).join('|')})`, 'gi');
	const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
		acceptNode: (node) =>
			node.parentElement?.closest('pre, code, script, style, mark') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT
	});
	const textNodes: Text[] = [];
	while (walker.nextNode()) textNodes.push(walker.currentNode as Text);

	let first: HTMLElement | undefined;
	for (const node of textNodes) {
		const parts = (node.nodeValue ?? '').split(pattern);
		if (parts.length === 1) continue;
		const fragment = document.createDocumentFragment();
		parts.forEach((part, index) => {
			if (!part) return;
			if (index % 2 === 0) {
				fragment.append(part);
				return;
			}
			const mark = document.createElement('mark');
			mark.className = 'sv-search-match';
			mark.textContent = part;
			first ??= mark;
			fragment.append(mark);
		});
		node.replaceWith(fragment);
	}
	return first;
}

/**
 * Cloned preview nodes for `href`. IDs get a prefix so previews never collide with
 * the host page's headings; `scrollTarget` finds the linked heading inside them.
 */
export async function fetchPreview(href: string): Promise<{ nodes: Element[]; scrollTarget?: string }> {
	const url = withoutHash(href);
	let pending = cache.get(url);
	if (!pending) {
		pending = load(url).catch(() => []);
		cache.set(url, pending);
	}
	const nodes = (await pending).map((node) => {
		const clone = node.cloneNode(true) as Element;
		for (const element of clone.querySelectorAll('[id]')) element.id = `sv-preview-${element.id}`;
		clone.removeAttribute(PREVIEW_ATTRIBUTE);
		return clone;
	});
	const hash = new URL(href, location.href).hash.slice(1);
	return { nodes, scrollTarget: hash ? `sv-preview-${decodeURIComponent(hash)}` : undefined };
}
