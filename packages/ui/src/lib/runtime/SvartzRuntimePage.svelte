<script lang="ts" module>
	import { vaults } from 'virtual:svartz/host';

	const base = vaults[0]?.basePath ?? '';
	/**
	 * Each URL the app serves, a note or an address that redirects to one, with the home page of the vault serving it:
	 * a version picker links a page in another version only when that version serves it. Built once per app.
	 */
	const vaultHomes = new Map(
		vaults.flatMap(({ mountPath, artifacts: { index } }) =>
			[...index.routes.all, ...Object.keys(index.routes.redirects)].map((route) => [`${base}${route}`, `${base}${mountPath}/`] as const)
		)
	);
</script>

<script lang="ts">
	import { resolveHostVault } from 'virtual:svartz/host';
	import { decodeRoutePath } from '@svartz/core';
	import SvartzVaultPage from './SvartzVaultPage.svelte';
	import type { ContentComponentOverrides } from './content-components.js';
	import { setVaultHomes } from '../site-routes.js';

	let { pathname, contentComponents = {} }: { pathname: string; contentComponents?: ContentComponentOverrides } = $props();
	setVaultHomes((href) => vaultHomes.get(href));
	// Strip the base while both are still encoded: a base from `site.url` keeps its percent escapes.
	const appPathname = $derived(
		decodeRoutePath(
			base && pathname.startsWith(`${base}/`) ? pathname.slice(base.length) : pathname === base ? '/' : pathname
		) ?? ''
	);
	const selected = $derived(resolveHostVault(appPathname));
</script>

{#if selected}
	{#key selected.id}
		<SvartzVaultPage {pathname} {contentComponents} runtimeTheme={selected.theme} artifacts={selected.artifacts} />
	{/key}
{/if}
