<!--
	Minimal's frame: Quartz's three columns. Left: the header and explorer.
	Centre: the page. Right: related material. Tablets move the right column
	under the page; phones turn the left column into a bar and the explorer
	into a drawer. List pages keep the right column empty so the reading column
	never moves.
-->
<script lang="ts">
	import type { FrameProps } from '../extension.js';

	let { shell, header, navigation, pageHead, body, aside, pageFoot, footer }: FrameProps = $props();
</script>

<div class="minimal" data-layout={shell.entry ? 'note' : 'list'} data-reader={shell.reader ? '' : undefined}>
	<aside class="left" aria-label="Site">
		{@render header()}
		<div class="explorer-panel" id="explorer-panel" data-open={shell.drawer ? '' : undefined}>
			{@render navigation()}
		</div>
	</aside>

	<main class="center" id="content" tabindex="-1">
		<div data-sv-preview>
			{@render pageHead()}
			{@render body()}
		</div>
		{@render pageFoot()}
	</main>

	<aside class="right" aria-label="Related">{@render aside()}</aside>

	<footer class="footer">{@render footer()}</footer>
</div>

<style>
	.minimal {
		--side: 16rem;
		/* Quartz's top spacing: all three columns start 6rem down. */
		--top: 6rem;
		display: grid;
		grid-template-columns: var(--side) minmax(0, 1fr) var(--side);
		grid-template-areas:
			'left center right'
			'left footer right';
		grid-template-rows: 1fr auto;
		column-gap: clamp(var(--sv-space-5), 3vw, var(--sv-space-7));
		max-inline-size: 92rem;
		min-block-size: 100dvh;
		margin-inline: auto;
		padding-inline: var(--sv-space-5);
	}

	.left,
	.right {
		position: sticky;
		inset-block-start: 0;
		display: flex;
		flex-direction: column;
		gap: var(--sv-space-5);
		align-self: start;
		max-block-size: 100dvh;
		padding-block: var(--top) var(--sv-space-5);
		overflow-y: auto;
		overscroll-behavior: contain;
		scrollbar-width: thin;
		transition: opacity var(--sv-duration) var(--sv-ease);
	}

	.left {
		grid-area: left;
		z-index: var(--sv-z-sticky);
	}

	.right {
		grid-area: right;
	}

	[data-reader] .left,
	[data-reader] .right {
		opacity: 0.08;
	}

	[data-reader] .left:is(:hover, :focus-within),
	[data-reader] .right:is(:hover, :focus-within) {
		opacity: 1;
	}

	.center {
		grid-area: center;
		min-inline-size: 0;
		padding-block: var(--top) var(--sv-space-6);
		outline: none;
	}

	.center > * {
		max-inline-size: var(--sv-measure);
		margin-inline: auto;
	}

	.footer {
		grid-area: footer;
		inline-size: 100%;
		max-inline-size: var(--sv-measure);
		margin-inline: auto;
	}

	/* Tablet: the right column moves under the note; contents hide, as in Quartz. */
	@media (max-width: 75rem) {
		.minimal {
			--side: 15rem;
			grid-template-columns: var(--side) minmax(0, 1fr);
			grid-template-areas:
				'left center'
				'left right'
				'left footer';
			grid-template-rows: auto auto 1fr;
		}

		.right {
			position: static;
			display: grid;
			grid-template-columns: repeat(auto-fit, minmax(14rem, 1fr));
			align-items: start;
			inline-size: 100%;
			max-inline-size: var(--sv-measure);
			max-block-size: none;
			margin-inline: auto;
			padding-block: 0 var(--sv-space-6);
			overflow: visible;
		}

		.right:empty {
			display: none;
		}

		.right :global(.toc) {
			display: none;
		}
	}

	/* Phone: the left column becomes a sticky bar; the explorer becomes a drawer. */
	@media (max-width: 50rem) {
		.minimal {
			grid-template-columns: minmax(0, 1fr);
			grid-template-areas: 'left' 'center' 'right' 'footer';
			grid-template-rows: auto;
			padding-inline: var(--sv-space-4);
		}

		.left {
			flex-direction: row;
			flex-wrap: wrap;
			align-items: center;
			justify-content: space-between;
			gap: var(--sv-space-2);
			max-block-size: none;
			margin-inline: calc(-1 * var(--sv-space-4));
			padding: var(--sv-space-2) var(--sv-space-3);
			overflow: visible;
			border-block-end: var(--sv-rule-width) solid var(--sv-rule);
			background: var(--sv-paper);
		}

		.explorer-panel {
			position: fixed;
			inset: var(--sv-drawer-top, 3.3rem) 0 0;
			z-index: var(--sv-z-drawer);
			padding: var(--sv-space-4) var(--sv-space-5) var(--sv-space-7);
			overflow-y: auto;
			background: var(--sv-paper);
			translate: -100% 0;
			visibility: hidden;
			transition:
				translate var(--sv-duration-slow) var(--sv-ease),
				visibility 0s linear var(--sv-duration-slow);
		}

		.explorer-panel[data-open] {
			translate: 0 0;
			visibility: visible;
			transition: translate var(--sv-duration-slow) var(--sv-ease);
		}

		.center {
			padding-block-start: var(--sv-space-5);
		}
	}
</style>
