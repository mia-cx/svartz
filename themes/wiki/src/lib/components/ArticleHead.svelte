<!-- An article's title over a rule, with the "From <site>" tagline and anything passed in (page actions). -->
<script lang="ts">
	import type { Snippet } from 'svelte';

	let { title, site, children }: { title: string; site: string; children?: Snippet } = $props();
</script>

<header class="article-head" id="top">
	<h1>{title}</h1>
	<p class="tagline">From {site}</p>
	{@render children?.()}
</header>

<style>
	.article-head {
		margin-block-end: var(--sv-space-3);
		padding-block-end: var(--sv-space-2);
		border-block-end: var(--sv-rule-width) solid var(--sv-rule-strong);
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
