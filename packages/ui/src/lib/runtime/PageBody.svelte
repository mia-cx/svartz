<script lang="ts">
	import ProtectedNote from './ProtectedNote.svelte';
	import type { PageModule, VaultPageState } from './vault-page-state.svelte.js';

	let { state, module }: { state: VaultPageState; module: PageModule } = $props();
	const protection = $derived(module.svartzProtected);
</script>

{#if protection}
	{#key `${protection.payloadId}:${protection.slug}`}
		<ProtectedNote
			{protection}
			loadBridgeUrls={state.artifacts.loadProtectedBridgeUrls}
			onUnlocked={state.revealGroup}
			onLocked={state.hideGroup}
			contentComponents={state.contentComponents}
			{...state.themeProps}
		/>
	{/key}
{:else}
	<module.default contentComponents={state.contentComponents} {...state.themeProps} />
{/if}
