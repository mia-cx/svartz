<!-- Recently updated pages, newest first. -->
<script lang="ts">
	import { formatDate, isoDate } from '../../format.js';
	import { newestFirst, noteDate } from '../../listing.js';
	import type { ThemePageProps } from '../../runtime/theme-props.js';
	import Badge from '../Badge.svelte';
	import { getReferenceShell } from '../context.js';
	import PageTitle from './PageTitle.svelte';

	let { vault }: ThemePageProps = $props();

	const shell = getReferenceShell();
	const entries = $derived(newestFirst(vault.entries));
</script>

<PageTitle title="Recently updated" />
<ul class="updates">
	{#each entries as entry (entry.slug)}
		{@const date = noteDate(entry)}
		{@const badge = shell.itemOf(entry)?.badge}
		<li>
			{#if date}<time class="sv-label" datetime={isoDate(date)}>{formatDate(date)}</time>{:else}<span></span>{/if}
			<span class="entry">
				{#if badge}<Badge {badge} fixed />{/if}
				<a href={entry.href} data-sv-internal>{entry.title}</a>
			</span>
		</li>
	{/each}
</ul>

<style>
	.updates {
		margin: 0;
		padding: 0;
		list-style: none;
	}

	li {
		display: grid;
		grid-template-columns: 8rem minmax(0, 1fr);
		gap: var(--sv-space-4);
		align-items: baseline;
		padding-block: var(--sv-space-2);
		border-block-end: var(--sv-rule-width) solid var(--sv-rule);
	}

	.entry {
		display: flex;
		align-items: baseline;
		gap: var(--sv-space-2);
		min-inline-size: 0;
	}

	a {
		color: var(--sv-ink);
		font-weight: 600;
		text-decoration: none;
		overflow-wrap: anywhere;
	}
</style>
