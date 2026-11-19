<!--
	The whole theme page for `pathname`: a note, list or 404 page, or with `pluginPage`, a plugin page under `/-/`
	rendered as the body of the theme's shell.
-->
<script lang="ts">
	import { resolveHostVault, vaults } from 'virtual:svartz/host';
	import { decodeRoutePath, type PluginPage } from '@svartz/core';
	import SvartzVaultPage from './SvartzVaultPage.svelte';
	import type { ContentComponentOverrides } from './content-components.js';

	let {
		pathname,
		contentComponents = {},
		pluginPage
	}: { pathname: string; contentComponents?: ContentComponentOverrides; pluginPage?: PluginPage } = $props();
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
		<SvartzVaultPage
			{pathname}
			{contentComponents}
			{pluginPage}
			runtimeTheme={selected.theme}
			artifacts={selected.artifacts}
		/>
	{/key}
{/if}
