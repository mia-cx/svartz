<script lang="ts">
	import type { ThemePageProps } from '@svartz/ui';
	import ListHeader from '../components/ListHeader.svelte';
	import { notesTagged } from '../listing.js';

	let { vault }: ThemePageProps = $props();

	const PREVIEW_COUNT = 3;
	const tags = $derived([...vault.tags].sort((left, right) => right.noteCount - left.noteCount || left.slug.localeCompare(right.slug)));
</script>

<ListHeader title="Tags" count="{tags.length} {tags.length === 1 ? 'tag' : 'tags'}" />
<ul class="tag-index">
	{#each tags as tag (tag.slug)}
		{@const notes = notesTagged(vault.entries, tag.slug)}
		<li>
			<div class="tag-head">
				<a class="sv-tag" href={tag.href}>{tag.title}</a>
				<span class="sv-label">{tag.noteCount} {tag.noteCount === 1 ? 'note' : 'notes'}</span>
			</div>
			<ul class="tag-notes">
				{#each notes.slice(0, PREVIEW_COUNT) as note (note.slug)}
					<li><a href={note.href} data-sv-internal>{note.title}</a></li>
				{/each}
				{#if notes.length > PREVIEW_COUNT}
					<li><a class="more" href={tag.href}>{notes.length - PREVIEW_COUNT} more</a></li>
				{/if}
			</ul>
		</li>
	{/each}
</ul>

<style>
	.tag-index {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(14rem, 1fr));
		gap: var(--sv-space-5);
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.tag-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--sv-space-2);
		padding-block-end: var(--sv-space-2);
		border-block-end: var(--sv-rule-width) solid var(--sv-rule);
	}

	.tag-notes {
		display: grid;
		gap: var(--sv-space-1);
		margin: var(--sv-space-2) 0 0;
		padding: 0;
		list-style: none;
		font-size: var(--sv-step--1);
	}

	.tag-notes a {
		color: var(--sv-text);
		text-decoration: none;
	}

	.tag-notes a:hover,
	.tag-notes .more {
		color: var(--sv-accent-text);
	}
</style>
