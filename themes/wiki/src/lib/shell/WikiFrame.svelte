<!--
	The wiki's frame: a sticky header across the page, then a left rail beside
	the article. There is no right column; a page another theme's renderer
	claims keeps its right column under the article. Phones and tablets turn the
	rail into a drawer under the header.
-->
<script lang="ts">
	import '../article.css';
	import type { FrameProps } from '@svartz/theme-minimal/runtime';

	let { shell, header, navigation, pageHead, body, aside, pageFoot, footer }: FrameProps = $props();
</script>

<header class="wiki-header">{@render header()}</header>

<div class="wiki">
	<!-- The shell's drawer finds the rail by this id, and the header's menu button controls it. -->
	<aside class="rail" id="explorer-panel" data-open={shell.drawer ? '' : undefined} aria-label="Site">
		{@render navigation()}
	</aside>

	<main class="main wiki-prose" id="content" tabindex="-1" inert={shell.drawer}>
		<div data-sv-preview>
			{@render pageHead()}
			{@render body()}
		</div>
		{#if shell.page?.renderer?.aside}<aside class="related" aria-label="Related">{@render aside()}</aside>{/if}
		{@render pageFoot()}
		<footer class="site-foot">{@render footer()}</footer>
	</main>
</div>

<style>
	/* `:has` outranks minimal's `:root` defaults. */
	:global(:root:has(.wiki)) {
		--sv-density: 0.85;
		--sv-ratio: 1.18;
		--sv-measure: 52rem;
		/* The sticky header's height: the rail sits under it and anchors scroll clear of it. */
		--wiki-head: 3.5rem;
		scroll-padding-block-start: var(--wiki-head);
	}

	:global(:root:has(.section-bar)) {
		--wiki-head: 5.75rem;
	}

	.wiki-header {
		box-sizing: border-box;
		block-size: var(--wiki-head);
		position: sticky;
		inset-block-start: 0;
		z-index: var(--sv-z-sticky);
		border-block-end: var(--sv-rule-width) solid var(--sv-rule);
		background: var(--sv-paper);
	}

	.wiki {
		display: grid;
		grid-template-columns: 14rem minmax(0, 1fr);
		column-gap: var(--sv-space-7);
		max-inline-size: 84rem;
		margin-inline: auto;
		padding-inline: var(--sv-space-5);
	}

	.rail {
		position: sticky;
		inset-block-start: var(--wiki-head);
		display: grid;
		align-content: start;
		gap: var(--sv-space-6);
		max-block-size: calc(100dvh - var(--wiki-head));
		padding-block: var(--sv-space-6);
		overflow-y: auto;
		scrollbar-width: thin;
		align-self: start;
	}

	.main {
		min-inline-size: 0;
		padding-block: var(--sv-space-6) var(--sv-space-7);
		outline: none;
	}

	.related {
		display: grid;
		gap: var(--sv-space-5);
		margin-block-start: var(--sv-space-6);
		clear: both;
	}

	.site-foot {
		margin-block-start: var(--sv-space-7);
	}

	/* Phone and tablet: the rail becomes a drawer under the header. */
	@media (max-width: 56rem) {
		/* The bar moves into the drawer, so the header is one row again. */
		:global(:root:has(.section-bar)) {
			--wiki-head: 3.5rem;
		}

		.wiki {
			grid-template-columns: minmax(0, 1fr);
			padding-inline: var(--sv-space-4);
		}

		.rail {
			position: fixed;
			inset: var(--wiki-head) 0 0;
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

		.rail[data-open] {
			translate: 0 0;
			visibility: visible;
			transition: translate var(--sv-duration-slow) var(--sv-ease);
		}
	}
</style>
