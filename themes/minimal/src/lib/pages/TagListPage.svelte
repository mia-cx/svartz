<!-- Every tag as its own section, with its first ten notes, as in Quartz's tag index. -->
<script lang="ts">
	import { count, notesTagged, tagHrefFor, type ThemePageProps } from '@svartz/ui';
	import ListHeader from '../components/ListHeader.svelte';
	import PageList from '../components/PageList.svelte';

	let { vault }: ThemePageProps = $props();

	const SHOWN_PER_TAG = 10;
	const tags = $derived([...vault.tags].sort((left, right) => left.slug.localeCompare(right.slug)));
	const tagHref = $derived(tagHrefFor(vault));
</script>

<ListHeader title="Tag index" summary="Found {count(tags.length, 'tag')}." />
{#each tags as tag (tag.slug)}
	{@const notes = notesTagged(vault.entries, tag.slug)}
	<section class="tag-section" aria-labelledby="tag-{tag.slug}">
		<h2 id="tag-{tag.slug}"><a class="sv-tag" href={tag.href}>{tag.title}</a></h2>
		<p class="summary">
			{count(notes.length, 'note')} with this tag.{#if notes.length > SHOWN_PER_TAG}{' '}Showing the first {SHOWN_PER_TAG}.{/if}
		</p>
		<PageList notes={notes.slice(0, SHOWN_PER_TAG)} {tagHref} />
	</section>
{/each}

<style>
	.tag-section {
		margin-block-start: var(--sv-space-7);
	}

	h2 {
		margin: 0;
	}

	h2 .sv-tag {
		font-size: var(--sv-step-2);
	}

	.summary {
		margin: var(--sv-space-3) 0 var(--sv-space-2);
		color: var(--sv-text);
	}
</style>
