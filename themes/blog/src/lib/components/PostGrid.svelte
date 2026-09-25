<!--
	Posts in a grid, with tag chips that filter it and a button that shows more.
	The chosen tag lives in `?tag=`, so a filtered view can be shared. Static
	pages render every post; filtering happens after hydration.
-->
<script lang="ts">
	import type { IndexEntry, VaultView } from '@svartz/core';
	import { onMount } from 'svelte';
	import PostCard from './PostCard.svelte';

	let {
		posts,
		vault,
		filter = true
	}: { posts: readonly IndexEntry[]; vault: VaultView; filter?: boolean } = $props();

	const PAGE_SIZE = 9;

	let tag = $state<string>();
	let shown = $state(PAGE_SIZE);

	const tags = $derived(
		[...new Set(posts.flatMap((post) => post.tags))].sort((left, right) => left.localeCompare(right))
	);
	const matching = $derived(tag ? posts.filter((post) => post.tags.includes(tag!)) : posts);
	const visible = $derived(matching.slice(0, shown));

	function choose(next: string | undefined) {
		tag = next;
		shown = PAGE_SIZE;
		const url = new URL(location.href);
		if (next) url.searchParams.set('tag', next);
		else url.searchParams.delete('tag');
		history.replaceState(history.state, '', url);
	}

	onMount(() => {
		const initial = new URL(location.href).searchParams.get('tag');
		if (initial && tags.includes(initial)) tag = initial;
	});
</script>

{#if filter && tags.length > 1}
	<div class="filters" role="group" aria-label="Filter posts by tag">
		<button type="button" class="chip" aria-pressed={!tag} onclick={() => choose(undefined)}>All</button>
		{#each tags as name (name)}
			<button type="button" class="chip" aria-pressed={tag === name} onclick={() => choose(name)}>#{name}</button>
		{/each}
	</div>
{/if}

<div class="grid">
	{#each visible as post (post.slug)}
		<PostCard {post} {vault} />
	{/each}
</div>

{#if matching.length > shown}
	<div class="more">
		<button type="button" class="more-button" onclick={() => (shown += PAGE_SIZE)}>Show more posts</button>
	</div>
{/if}

<style>
	.filters {
		display: flex;
		flex-wrap: wrap;
		gap: var(--sv-space-2);
		margin-block-end: var(--sv-space-6);
	}

	.chip {
		padding: 0.3em 0.8em;
		border: var(--sv-rule-width) solid var(--sv-rule);
		border-radius: var(--sv-radius-pill);
		background: none;
		color: var(--sv-text);
		font: inherit;
		font-size: var(--sv-step--1);
		cursor: pointer;
		transition:
			border-color var(--sv-duration-fast) var(--sv-ease),
			color var(--sv-duration-fast) var(--sv-ease);
	}

	.chip:hover {
		border-color: var(--sv-rule-strong);
		color: var(--sv-ink);
	}

	.chip[aria-pressed='true'] {
		border-color: var(--sv-ink);
		background: var(--sv-ink);
		color: var(--sv-paper);
	}

	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(18rem, 1fr));
		gap: var(--sv-space-7) var(--sv-space-6);
	}

	.more {
		display: flex;
		justify-content: center;
		margin-block-start: var(--sv-space-7);
	}

	.more-button {
		padding: 0.7em 1.6em;
		border: var(--sv-rule-width) solid var(--sv-ink);
		border-radius: var(--sv-radius-pill);
		background: none;
		color: var(--sv-ink);
		font: inherit;
		font-weight: 600;
		cursor: pointer;
	}

	.more-button:hover {
		background: var(--sv-ink);
		color: var(--sv-paper);
	}
</style>
