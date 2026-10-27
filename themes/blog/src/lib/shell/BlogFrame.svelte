<!--
	The blog's frame: a header across the top, one reading column, and the
	footer. There is no explorer; the header carries the navigation. The right
	column (related posts) sits under the page.
-->
<script lang="ts">
	import type { FrameProps } from '@svartz/theme-minimal/runtime';

	let { shell, header, pageHead, body, aside, pageFoot, footer }: FrameProps = $props();
</script>

<header class="site-header"><div class="inner">{@render header()}</div></header>

<main class="inner main" id="content" tabindex="-1" inert={shell.drawer}>
	<div data-sv-preview>
		{@render pageHead()}
		{@render body()}
	</div>
	{@render pageFoot()}
	{@render aside()}
</main>

<footer class="site-foot"><div class="inner">{@render footer()}</div></footer>

<style>
	:global(:root) {
		--sv-density: 1.15;
		--sv-ratio: 1.26;
		--sv-measure: 40rem;
	}

	.site-header {
		border-block-end: var(--sv-rule-width) solid var(--sv-rule);
	}

	.inner {
		max-inline-size: 76rem;
		margin-inline: auto;
		padding-inline: var(--sv-space-5);
	}

	.main {
		padding-block: var(--sv-space-6) var(--sv-space-8);
		outline: none;
	}

	.main :global(article.sv-prose) {
		margin-inline: auto;
	}

	/* Images in a post break out of the reading column, as in Ghost. */
	.main :global(article.sv-prose p > img:only-child) {
		inline-size: min(56rem, 100vw - 2 * var(--sv-space-5));
		max-inline-size: none;
		margin-inline: 50%;
		translate: -50% 0;
	}

	.site-foot {
		border-block-start: var(--sv-rule-width) solid var(--sv-rule);
		background: var(--sv-surface);
	}
</style>
