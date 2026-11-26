import { getContext, setContext } from 'svelte';

const key = Symbol('svartz.site-routes');

/** Given a URL with the deployment base, the home page of the vault that serves it, or `undefined` when none does. */
export type VaultHomeOf = (href: string) => string | undefined;

/**
 * Called by a Svartz runtime page, so a component can link to a page in another vault, such as another version, only
 * when that vault serves it.
 */
export function setVaultHomes(homeOf: VaultHomeOf): void {
	setContext(key, homeOf);
}

/** The home page of the vault serving a URL; `undefined` for every URL outside a Svartz page. Call it during component init. */
export function getVaultHomes(): VaultHomeOf {
	return getContext<VaultHomeOf | undefined>(key) ?? (() => undefined);
}
