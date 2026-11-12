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

	// Not `state`, which would shadow the `$state` rune.
	const vaultPage = new VaultPageState(() => ({
		appPathname,
		runtimeTheme,
		artifacts,
		contentComponents
	}));
	// base.css stays loaded after client navigation away from the note, and the body's marker goes
	// with it, so the document keeps a host-page flag until a Svartz theme page renders.
	$effect(() => {
		if (vaultPage.noteModule) document.documentElement.dataset.svartzHostPage = '';
	});
	/**
	 * The body's `data-svartz-note`: the slug plugins key the note by, as on theme-minimal's pages, so the vault's
	 * annotations attach beside it. A protected note stays unmarked, locked or unlocked, so nothing quotes it.
	 */
	const noteKey = $derived(vaultPage.noteModule?.svartzProtected ? undefined : vaultPage.entry?.slug);
	// The scripts get this body, not the document's first, so each note on a page keeps its own annotations.
	let body = $state<HTMLElement>();
	useBrowserResources(() =>
		vaultPage.noteModule && body
			? { artifacts, pathname: `${artifacts.deploymentBasePath}${appPathname}`, note: body }
			: undefined
	);
</script>

<svelte:head>
	{#if vaultPage.noteModule}
		{#each stylesheets as href (href)}<link rel="stylesheet" {href} />{/each}
	{/if}
</svelte:head>

{#if vaultPage.noteModule}
	<!-- Clarity must never record a note body, including content decrypted after hydration.
	     `data-svartz-note-content` keeps base.css's element defaults off the host page. -->
	<div
		bind:this={body}
		class="sv-prose"
		data-sv-preview
		data-clarity-mask="true"
		data-svartz-note-content
		data-svartz-note={noteKey}
	>
		<PageBody state={vaultPage} module={vaultPage.noteModule} />
	</div>
{/if}
