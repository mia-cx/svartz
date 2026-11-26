<script lang="ts">
	import { resolveHostVault, routes, vaults } from 'virtual:svartz/host';
	import { decodeRoutePath } from '@svartz/core';
	import SvartzVaultPage from './SvartzVaultPage.svelte';
	import type { ContentComponentOverrides } from './content-components.js';
	import { setSiteRoutes } from '../site-routes.js';

	let { pathname, contentComponents = {} }: { pathname: string; contentComponents?: ContentComponentOverrides } = $props();
	const base = vaults[0]?.basePath ?? '';
	// Notes and the addresses that redirect to them, in every vault: a version picker links a page across vaults.
	const siteRoutes = new Set([...routes.all, ...Object.keys(routes.redirects)].map((route) => `${base}${route}`));
	setSiteRoutes(() => siteRoutes);
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
