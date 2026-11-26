import { getContext, setContext } from 'svelte';

const key = Symbol('svartz.site-routes');

/**
 * Called by a Svartz runtime page: every URL the app serves, across all its vaults, with the deployment base, so a
 * component can link to a page in another vault (such as another version) only when it exists.
 */
export function setSiteRoutes(read: () => ReadonlySet<string>): void {
	setContext(key, read);
}

/** Whether the app serves `href`; `false` for every URL outside a Svartz page. Call it during component init. */
export function getSiteRoutes(): (href: string) => boolean {
	const read = getContext<(() => ReadonlySet<string>) | undefined>(key);
	return (href) => read?.().has(href) ?? false;
}
