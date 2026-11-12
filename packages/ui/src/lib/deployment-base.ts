import { getContext, setContext } from 'svelte';

// SvelteKit 3's `$app/paths` has no `base`, so Svartz components read the base Svartz generated instead.
const key = Symbol('svartz.deployment-base');

/** Called by a Svartz runtime page: descendants read the rendered vault's `deploymentBasePath` (SvelteKit's `paths.base`). */
export function setDeploymentBase(read: () => string): void {
	setContext(key, read);
}

/** Reads the deployment base of the Svartz page rendering this component, or `''` outside one. Call it during component init. */
export function getDeploymentBase(): () => string {
	return getContext<(() => string) | undefined>(key) ?? (() => '');
}
