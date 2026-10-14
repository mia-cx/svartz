<script lang="ts">
	import PageBody from './PageBody.svelte';
	import { useBrowserResources, VaultPageState } from './vault-page-state.svelte.js';
	import type { ContentComponentOverrides } from './content-components.js';

	let {
		appPathname,
		contentComponents = {},
		stylesheets,
		runtimeTheme,
		artifacts
	}: {
		appPathname: string;
		contentComponents?: ContentComponentOverrides;
		stylesheets: readonly string[];
		runtimeTheme: typeof import('virtual:svartz/theme');
		artifacts: typeof import('virtual:svartz/artifacts');
	} = $props();

	const state = new VaultPageState(() => ({
		appPathname,
		runtimeTheme,
		artifacts,
		contentComponents
	}));
	useBrowserResources(() => ({
		artifacts,
		pathname: `${artifacts.deploymentBasePath}${appPathname}`
	}));
</script>

<svelte:head>
	{#if state.noteModule}
		{#each stylesheets as href (href)}<link rel="stylesheet" {href} />{/each}
	{/if}
</svelte:head>

{#if state.noteModule}
	<!-- Clarity must never record a note body, including content decrypted after hydration. -->
	<div data-clarity-mask="true" style="display: contents">
		<PageBody {state} module={state.noteModule} />
	</div>
{/if}
