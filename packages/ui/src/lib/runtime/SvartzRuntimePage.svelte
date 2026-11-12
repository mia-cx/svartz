<script lang="ts">
	import { resolveHostVault, vaults } from 'virtual:svartz/host';
	import { decodeRoutePath } from '@svartz/core';
	import SvartzVaultPage from './SvartzVaultPage.svelte';
	import type { ContentComponentOverrides } from './content-components.js';

	let { pathname, contentComponents = {} }: { pathname: string; contentComponents?: ContentComponentOverrides } = $props();
	const base = vaults[0]?.basePath ?? '';
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
