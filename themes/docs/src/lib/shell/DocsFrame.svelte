<!--
	The docs frame: a full-width top bar over three columns. Left: the
	reference explorer. Centre: the page and its footer. Right: "On this page".
	Tablets move the right column under the page, hiding its contents list but
	keeping another theme's examples; phones turn the explorer into a drawer
	under the top bar.
-->
<script lang="ts">
	import type { FrameProps } from '@svartz/theme-minimal/runtime';

	let { shell, header, navigation, pageHead, body, aside, pageFoot, footer }: FrameProps = $props();
</script>

<header class="top-bar">{@render header()}</header>

<div class="docs">
	<!-- The shell's drawer finds the explorer by this id. -->
	<aside class="sidebar" id="explorer-panel" aria-label="Reference" data-open={shell.drawer ? '' : undefined}>
		{@render navigation()}
	</aside>

	<main class="content" id="content" tabindex="-1" inert={shell.drawer}>
		<div data-sv-preview>
			{@render pageHead()}
			{@render body()}
		</div>
		{@render pageFoot()}
		<footer class="page-foot">{@render footer()}</footer>
	</main>

	<aside class="rail" aria-label="On this page">{@render aside()}</aside>
</div>

<style>
	:global(:root) {
		--sv-density: 0.9;
		--sv-ratio: 1.17;
		--sv-measure: 48rem;
	}

	.top-bar {
		position: sticky;
		inset-block-start: 0;
		z-index: var(--sv-z-sticky);
		display: flex;
		align-items: center;
		gap: var(--sv-space-3);
		block-size: 3.5rem;
		/* Edges line up with the centred page below on wide screens. */
		padding-inline: max(var(--sv-space-5), (100% - 90rem) / 2 + var(--sv-space-5));
		border-block-end: var(--sv-rule-width) solid var(--sv-rule);
		background: var(--sv-paper);
	}

	.docs {
		display: grid;
		grid-template-columns: 16rem minmax(0, 1fr) 13rem;
		column-gap: var(--sv-space-7);
		max-inline-size: 90rem;
		margin-inline: auto;
		padding-inline: var(--sv-space-5);
	}

	.sidebar,
	.rail {
		position: sticky;
		inset-block-start: 3.5rem;
		align-self: start;
		max-block-size: calc(100dvh - 3.5rem);
		padding-block: var(--sv-space-6);
		overflow-y: auto;
		scrollbar-width: thin;
	}

	.content {
		min-inline-size: 0;
		max-inline-size: var(--sv-measure);
		padding-block: var(--sv-space-6) var(--sv-space-7);
		outline: none;
	}

	.content :global(.note-body) {
		max-inline-size: none;
		margin-block-start: var(--sv-space-5);
	}

	.page-foot {
		margin-block-start: var(--sv-space-8);
		padding-block-start: var(--sv-space-4);
		border-block-start: var(--sv-rule-width) solid var(--sv-rule);
	}

	@media (max-width: 72rem) {
		.docs {
			grid-template-columns: 15rem minmax(0, 1fr);
		}

		/* The rail drops under the page; contents hide, but another theme's examples stay readable. */
		.rail {
			position: static;
			grid-column: 2;
			max-block-size: none;
			padding-block: 0 var(--sv-space-6);
		}

		.rail :global(.on-this-page) {
			display: none;
		}
	}

	@media (max-width: 52rem) {
		.top-bar {
			padding-inline: var(--sv-space-3);
		}

		.docs {
			grid-template-columns: minmax(0, 1fr);
			padding-inline: var(--sv-space-4);
		}

		.rail {
			grid-column: 1;
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
