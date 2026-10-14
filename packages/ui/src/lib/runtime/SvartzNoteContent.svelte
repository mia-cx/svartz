<!-- @component
Renders one published note's body inside a host-owned page. The route's universal
`load` must have awaited `prepareHostVault(pathname)` first. `stylesheets` comes
from `await noteStylesheets(pathname)` in the route's server `load` (`+page.server.ts`);
the helper prepares the vault itself, and only serialized server data keeps the
SSR links because a universal `load` reruns in the browser where the registry is
empty. For a pathname that is not a published note (or a vault
that was not prepared) it renders nothing.
-->
<script lang="ts">
	import { resolveHostVault } from 'virtual:svartz/host';
	import VaultNoteContent from './VaultNoteContent.svelte';
	import type { ContentComponentOverrides } from './content-components.js';

	let {
		pathname,
		stylesheets,
		contentComponents = {}
	}: {
		pathname: string;
		stylesheets: readonly string[];
		contentComponents?: ContentComponentOverrides;
	} = $props();

	const appPathname = $derived(pathname.endsWith('/') ? pathname : `${pathname}/`);
	const selected = $derived(resolveHostVault(appPathname));
</script>

{#if selected}
	{#key selected.id}
		<VaultNoteContent
			{appPathname}
			{contentComponents}
			{stylesheets}
			runtimeTheme={selected.theme}
			artifacts={selected.artifacts}
		/>
	{/key}
{/if}
