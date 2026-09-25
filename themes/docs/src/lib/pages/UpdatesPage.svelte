<!-- Recently updated pages, newest first. -->
<script lang="ts">
	import { formatDate, isoDate, newestFirst, noteDate, type ThemePageProps } from '@svartz/ui';
	import KindBadge from '../components/KindBadge.svelte';
	import PageTitle from '../components/PageTitle.svelte';
	import { readSymbol } from '../symbols.js';

	let { vault }: ThemePageProps = $props();

	const entries = $derived(newestFirst(vault.entries));
</script>

<PageTitle title="Recently updated" />
<ul class="updates">
	{#each entries as entry (entry.slug)}
		{@const date = noteDate(entry)}
		{@const symbol = readSymbol(entry.properties)}
		<li>
			{#if date}<time class="sv-label" datetime={isoDate(date)}>{formatDate(date)}</time>{:else}<span></span>{/if}
			<span class="entry">
				{#if symbol}<KindBadge kind={symbol.kind} short />{/if}
				<a href={entry.href} class:mono={symbol} data-sv-internal>{symbol?.name ?? entry.title}</a>
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
		align-items: center;
		gap: var(--sv-space-2);
	}

	a {
		color: var(--sv-ink);
		font-weight: 600;
		text-decoration: none;
	}

	a.mono {
		font-family: var(--sv-font-mono);
	}
</style>
