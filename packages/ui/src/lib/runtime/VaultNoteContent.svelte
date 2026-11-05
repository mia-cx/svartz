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
	// base.css stays loaded after client navigation away from the note, and the body's marker goes
	// with it, so the document keeps a host-page flag until a Svartz theme page renders.
	$effect(() => {
		if (state.noteModule) document.documentElement.dataset.svartzHostPage = '';
	});
	useBrowserResources(() =>
		state.noteModule
			? { artifacts, pathname: `${artifacts.deploymentBasePath}${appPathname}` }
			: undefined
	);
</script>

<svelte:head>
	{#if state.noteModule}
		{#each stylesheets as href (href)}<link rel="stylesheet" {href} />{/each}
	{/if}
</svelte:head>

{#if state.noteModule}
	<!-- Clarity must never record a note body, including content decrypted after hydration.
	     `data-svartz-note-content` keeps base.css's element defaults off the host page. -->
	<div class="sv-prose" data-sv-preview data-clarity-mask="true" data-svartz-note-content>
		<PageBody {state} module={state.noteModule} />
	</div>
{/if}
