<script lang="ts">
	import { resolveHostVault, vaults } from 'virtual:svartz/host';
	import { decodeRoutePath } from '@svartz/core';
	import SvartzVaultPage from './SvartzVaultPage.svelte';
	import type { ContentComponentOverrides } from './content-components.js';

	let { pathname, contentComponents = {} }: { pathname: string; contentComponents?: ContentComponentOverrides } = $props();
	const base = vaults[0]?.basePath ?? '';
	const decodedPathname = $derived(decodeRoutePath(pathname) ?? '');
	const appPathname = $derived(
		base && decodedPathname.startsWith(`${base}/`)
			? decodedPathname.slice(base.length)
			: decodedPathname === base
				? '/'
				: decodedPathname
	);
	const selected = $derived(resolveHostVault(appPathname));
</script>

{#if selected}
	{#key selected.id}
		<SvartzVaultPage {pathname} {contentComponents} runtimeTheme={selected.theme} artifacts={selected.artifacts} />
	{/key}
{/if}
