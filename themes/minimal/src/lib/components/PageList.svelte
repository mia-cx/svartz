<!-- A dated list of notes: date, title and description, tags. Used by every list page. -->
<script lang="ts">
	import type { IndexEntry } from '@svartz/core';
	import { formatDate, isoDate } from '@svartz/ui';
	import { noteDate } from '../listing.js';

	let {
		notes,
		folders = [],
		tagHref
	}: {
		notes: readonly IndexEntry[];
		folders?: readonly { slug: string; title: string; href: string; noteCount: number }[];
		tagHref: (tag: string) => string;
	} = $props();
</script>

<ul class="page-list">
	{#each folders as folder (folder.slug)}
		<li class="row">
			<span class="sv-label">Folder</span>
			<div>
				<a class="title" href={folder.href}>{folder.title}</a>
				<p class="description">{folder.noteCount} {folder.noteCount === 1 ? 'note' : 'notes'}</p>
			</div>
		</li>
	{/each}
	{#each notes as note (note.slug)}
		{@const date = noteDate(note)}
		<li class="row">
			{#if date}<time class="sv-label" datetime={isoDate(date)}>{formatDate(date)}</time>{:else}<span></span>{/if}
			<div>
				<a class="title" href={note.href} data-sv-internal>{note.title}</a>
				{#if note.description}<p class="description">{note.description}</p>{/if}
			</div>
			{#if note.tags.length > 0}
				<ul class="row-tags" aria-label="Tags">
					{#each note.tags.slice(0, 3) as tag (tag)}<li><a class="sv-tag" href={tagHref(tag)}>{tag}</a></li>{/each}
				</ul>
			{/if}
		</li>
	{/each}
</ul>

<style>
	.page-list {
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.row {
		display: grid;
		grid-template-columns: 7.5rem minmax(0, 1fr) auto;
		gap: var(--sv-space-1) var(--sv-space-4);
		align-items: baseline;
		padding-block: var(--sv-space-3);
		border-block-end: var(--sv-rule-width) solid var(--sv-rule);
	}

	.title {
		color: var(--sv-ink);
		font-family: var(--sv-font-display);
		font-size: var(--sv-step-1);
		font-weight: 600;
		text-decoration: none;
	}

	.title:hover {
		color: var(--sv-accent-text);
	}

	.description {
		margin: var(--sv-space-1) 0 0;
		color: var(--sv-muted);
		font-size: var(--sv-step--1);
	}

	.row-tags {
		display: flex;
		flex-wrap: wrap;
		gap: var(--sv-space-1);
		justify-content: end;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	@media (max-width: 40rem) {
		.row {
			grid-template-columns: minmax(0, 1fr);
		}

		.row-tags {
			justify-content: start;
		}
	}
</style>
