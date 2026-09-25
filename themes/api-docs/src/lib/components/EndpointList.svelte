<!-- A resource's pages as rows: method pill, title, and path (or model name). -->
<script lang="ts">
	import type { IndexEntry } from '@svartz/core';
	import MethodPill from './MethodPill.svelte';
	import { readModel, readOperation } from '../api.js';

	let { entries }: { entries: readonly IndexEntry[] } = $props();
</script>

<ul class="endpoints">
	{#each entries as entry (entry.slug)}
		{@const operation = readOperation(entry.properties)}
		{@const model = readModel(entry.properties)}
		<li>
			{#if operation}<MethodPill {operation} />{:else if model}<span class="sv-label kind">Model</span>{:else}<span class="sv-label kind">Guide</span>{/if}
			<a href={entry.href} data-sv-internal>{model ? `The ${model.name} object` : entry.title}</a>
			{#if operation?.protocol === 'rest'}<code>{operation.path}</code>{/if}
		</li>
	{/each}
</ul>

<style>
	.endpoints {
		margin: 0;
		padding: 0;
		list-style: none;
	}

	li {
		display: grid;
		grid-template-columns: 6rem minmax(0, 1fr) auto;
		gap: var(--sv-space-3);
		align-items: center;
		padding-block: var(--sv-space-2);
		border-block-end: var(--sv-rule-width) solid var(--sv-rule);
	}

	.kind {
		text-align: center;
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
		overflow: hidden;
		color: var(--sv-muted);
		font-family: var(--sv-font-mono);
		font-size: var(--sv-step--1);
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	@media (max-width: 40rem) {
		li {
			grid-template-columns: 6rem minmax(0, 1fr);
		}

		code {
			grid-column: 2;
		}
	}
</style>
