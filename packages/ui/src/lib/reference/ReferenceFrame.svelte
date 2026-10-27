<!--
	The reference frame for theme-minimal's shell: a top bar, the explorer in a
	sidebar, and the page with its right column beside it, wide enough for code
	examples. Examples drop below the page before the sidebar goes; on phones
	the sidebar becomes a drawer. It only lays out the regions minimal renders.
-->
<script lang="ts">
	import type { Snippet } from 'svelte';

	let {
		shell,
		header,
		navigation,
		pageHead,
		body,
		aside,
		pageFoot,
		footer
	}: {
		shell: { readonly drawer: boolean };
		header: Snippet;
		navigation: Snippet;
		pageHead: Snippet;
		body: Snippet;
		aside: Snippet;
		pageFoot: Snippet;
		footer: Snippet;
	} = $props();
</script>

{@render header()}

<div class="frame">
	<aside class="sidebar" id="explorer-panel" aria-label="Pages" data-open={shell.drawer ? '' : undefined}>
		{@render navigation()}
	</aside>

	<main class="main" id="content" tabindex="-1" inert={shell.drawer}>
		<div class="split">
			<div class="page">
				<div data-sv-preview>{@render pageHead()}{@render body()}</div>
				{@render pageFoot()}
			</div>
			<aside class="aside" aria-label="Beside the page">{@render aside()}</aside>
		</div>
		{@render footer()}
	</main>
</div>

<style>
	:global(:root) {
		--sv-density: 0.85;
		--sv-ratio: 1.15;
		--sv-measure: 44rem;
	}

	.frame {
		display: grid;
		grid-template-columns: 16rem minmax(0, 1fr);
		column-gap: var(--sv-space-7);
		max-inline-size: 100rem;
		margin-inline: auto;
		padding-inline: var(--sv-space-5);
	}

	.sidebar {
		position: sticky;
		inset-block-start: 3.5rem;
		align-self: start;
		max-block-size: calc(100dvh - 3.5rem);
		padding-block: var(--sv-space-6);
		overflow-y: auto;
		overscroll-behavior: contain;
		scrollbar-width: thin;
	}

	.main {
		min-inline-size: 0;
		padding-block: var(--sv-space-6) 0;
		outline: none;
	}

	.split {
		display: grid;
		/* The right column yields first: a share of the width, clamped, and the page takes the rest. */
		grid-template-columns: minmax(0, var(--sv-measure)) clamp(20rem, 35%, 34rem);
		gap: var(--sv-space-7);
		align-items: start;
	}

	/* Nothing beside the page: it keeps the reading width alone. */
	.split:has(> .aside:not(:has(*))) {
		grid-template-columns: minmax(0, var(--sv-measure));
	}

	.split:has(> .aside:not(:has(*))) > .aside {
		display: none;
	}

	.page {
		min-inline-size: 0;
	}

	.aside {
		position: sticky;
		inset-block-start: calc(3.5rem + var(--sv-space-5));
		min-inline-size: 0;
		max-block-size: calc(100dvh - 3.5rem - 2 * var(--sv-space-5));
		overflow-y: auto;
		scrollbar-width: thin;
	}

	.main > :global(:last-child) {
		max-inline-size: var(--sv-measure);
		margin-block-start: var(--sv-space-8);
	}

	@media (max-width: 72rem) {
		.split {
			grid-template-columns: minmax(0, var(--sv-measure));
		}

		.aside {
			position: static;
			max-block-size: none;
		}

		/* Contents only help beside the page. */
		.aside :global(.toc) {
			display: none;
		}
	}

	@media (max-width: 52rem) {
		.frame {
			grid-template-columns: minmax(0, 1fr);
			padding-inline: var(--sv-space-4);
		}

		.sidebar {
			position: fixed;
			inset: 3.5rem 0 0;
			align-self: stretch;
			z-index: var(--sv-z-drawer);
			max-block-size: none;
			padding: var(--sv-space-5);
			background: var(--sv-paper);
			translate: -100% 0;
			visibility: hidden;
			transition:
				translate var(--sv-duration-slow) var(--sv-ease),
				visibility 0s linear var(--sv-duration-slow);
		}

		.sidebar[data-open] {
			translate: 0 0;
			visibility: visible;
			transition: translate var(--sv-duration-slow) var(--sv-ease);
		}
	}
</style>
