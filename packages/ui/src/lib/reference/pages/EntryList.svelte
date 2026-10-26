<!-- Pages as rows: the kind badge, the page title, and its path or name. -->
<script lang="ts">
	import type { IndexEntry } from '@svartz/core';
	import Badge from '../Badge.svelte';
	import BreakAfterSlashes from '../BreakAfterSlashes.svelte';
	import { getReferenceShell } from '../context.js';

	let { entries }: { entries: readonly IndexEntry[] } = $props();

	const shell = getReferenceShell();
</script>

<ul class="entries">
	{#each entries as entry (entry.slug)}
		{@const item = shell.itemOf(entry)}
		<li>
			{#if item?.badge}<Badge badge={item.badge} fixed />{:else}<span class="sv-label kind">Guide</span>{/if}
			<span class="text">
				<a href={entry.href} data-sv-internal>{entry.title}</a>
				{#if item && item.label !== entry.title}<code><BreakAfterSlashes text={item.label} /></code>{/if}
			</span>
		</li>
	{/each}
</ul>

<style>
	.entries {
		margin: 0;
		padding: 0;
		list-style: none;
	}

	li {
		display: flex;
		align-items: baseline;
		gap: var(--sv-space-3);
		padding-block: var(--sv-space-2);
		border-block-end: var(--sv-rule-width) solid var(--sv-rule);
	}

	/* The badge column's width, in the badges' monospace `ch`. */
	.kind {
		box-sizing: content-box;
		flex: none;
		inline-size: 8ch;
		padding-inline: 0.3em;
		font-family: var(--sv-font-mono);
		font-size: 0.62rem;
		text-align: center;
	}

	.text {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: var(--sv-space-1) var(--sv-space-3);
		min-inline-size: 0;
	}

	a {
		color: var(--sv-ink);
		font-weight: 600;
		text-decoration: none;
	}

	a:hover {
		text-decoration: underline;
		text-decoration-color: var(--sv-accent);
		text-underline-offset: 0.2em;
	}

	code {
		color: var(--sv-muted);
		font-family: var(--sv-font-mono);
		font-size: var(--sv-step--1);
		overflow-wrap: anywhere;
	}
</style>
