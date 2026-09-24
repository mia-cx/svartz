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
