<script lang="ts">
	import { formatDate, tagHrefFor, type ThemePageProps } from '@svartz/ui';
	import PageTitle from '../components/PageTitle.svelte';
	import { byDay } from '../wiki.js';

	let { vault }: ThemePageProps = $props();

	const days = $derived(byDay(vault.entries));
	const tagHref = $derived(tagHrefFor(vault));
</script>

<PageTitle title="Recent changes" summary="The most recent edits to this wiki, newest first." />
{#each days as day (day.date)}
	<section class="day" aria-labelledby="day-{day.date}">
		<h2 id="day-{day.date}"><time datetime={day.date}>{formatDate(day.date)}</time></h2>
		<ul>
			{#each day.entries as note (note.slug)}
				<li>
					<a href={note.href} data-sv-internal>{note.title}</a>
					{#if note.description}<span class="description">{note.description}</span>{/if}
					{#each note.tags as tag (tag)}<a class="sv-tag" href={tagHref(tag)}>{tag}</a>{/each}
				</li>
			{/each}
		</ul>
	</section>
{/each}

<style>
	.day {
		margin-block-end: var(--sv-space-5);
	}

	h2 {
		margin: 0 0 var(--sv-space-2);
		padding-block-end: var(--sv-space-1);
		border-block-end: var(--sv-rule-width) solid var(--sv-rule);
		color: var(--sv-ink);
		font-size: var(--sv-step-1);
		font-weight: 700;
	}

	ul {
		display: grid;
		gap: var(--sv-space-2);
		margin: 0;
		padding-inline-start: 1.1em;
	}

	li {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: var(--sv-space-1) var(--sv-space-2);
	}

	li > a:first-child {
		color: var(--sv-ink);
		font-weight: 600;
	}

	.description {
		color: var(--sv-muted);
	}

	.description::before {
		content: '— ';
	}
</style>
