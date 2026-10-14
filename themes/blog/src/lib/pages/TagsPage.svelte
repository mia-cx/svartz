<script lang="ts">
	import { count, notesTagged, type ThemePageProps } from '@svartz/ui';
	import { blogPosts } from '../blog.js';
	import PageHeader from '../components/PageHeader.svelte';

	let { vault }: ThemePageProps = $props();

	const tags = $derived([...vault.tags].sort((left, right) => right.noteCount - left.noteCount || left.title.localeCompare(right.title)));
</script>

<PageHeader title="Tags" summary="Every topic, by how often it comes up." />
<ul class="tags">
	{#each tags as tag (tag.slug)}
		{@const latest = blogPosts(notesTagged(vault.entries, tag.slug))[0]}
		<li>
			<a class="name" href={tag.href}>#{tag.title}</a>
			<span class="sv-label">{count(tag.noteCount, 'post')}</span>
			{#if latest}<span class="latest">Latest: {latest.title}</span>{/if}
		</li>
	{/each}
</ul>

<style>
	.tags {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(16rem, 1fr));
		gap: var(--sv-space-4);
		margin: 0;
		padding: 0;
		list-style: none;
	}

	li {
		position: relative;
		display: grid;
		gap: var(--sv-space-1);
		padding: var(--sv-space-4);
		border: var(--sv-rule-width) solid var(--sv-rule);
		border-radius: var(--sv-radius-m);
		transition: border-color var(--sv-duration-fast) var(--sv-ease);
	}

	li:hover {
		border-color: var(--sv-ink);
	}

	.name {
		color: var(--sv-ink);
		font-size: var(--sv-step-2);
		font-weight: 700;
		text-decoration: none;
	}

	.name::after {
		content: '';
		position: absolute;
		inset: 0;
	}

	.latest {
		color: var(--sv-muted);
		font-size: var(--sv-step--1);
	}
</style>
