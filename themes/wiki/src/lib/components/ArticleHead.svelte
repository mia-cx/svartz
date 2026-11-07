<!--
	An article's title over a rule, with the "From <site>" tagline. Anything
	passed in (page actions) sits beside the title, like Wikipedia's Edit tab,
	and wraps under it when the title fills the line.
-->
<script lang="ts">
	import type { Snippet } from 'svelte';

	let { title, site, children }: { title: string; site: string; children?: Snippet } = $props();
</script>

<header class="article-head" id="top">
	<div class="title-row">
		<h1>{title}</h1>
		{@render children?.()}
	</div>
	<p class="tagline">From {site}</p>
</header>

<style>
	.article-head {
		margin-block-end: var(--sv-space-3);
		padding-block-end: var(--sv-space-2);
		border-block-end: var(--sv-rule-width) solid var(--sv-rule-strong);
	}

	.title-row {
		display: flex;
		flex-wrap: wrap;
		align-items: end;
		justify-content: space-between;
		gap: var(--sv-space-2) var(--sv-space-4);
	}

	.title-row :global(.sv-page-actions) {
		margin: 0;
	}

	h1 {
		margin: 0;
		color: var(--sv-ink);
		font-size: var(--sv-step-5);
		font-weight: 700;
		line-height: 1.1;
	}

	.tagline {
		margin: var(--sv-space-2) 0 0;
		color: var(--sv-muted);
		font-size: var(--sv-step--1);
	}
</style>
