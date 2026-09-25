<!-- A module's symbols by kind: name with badge, then its one-line summary. -->
<script lang="ts">
	import type { IndexEntry } from '@svartz/core';
	import KindBadge from './KindBadge.svelte';
	import { groupByKind, KIND_HEADINGS, readSymbol } from '../symbols.js';

	let { entries }: { entries: readonly IndexEntry[] } = $props();

	const groups = $derived(groupByKind(entries));
</script>

{#each groups as group (group.kind)}
	<section aria-labelledby="kind-{group.kind}">
		<h2 id="kind-{group.kind}">{KIND_HEADINGS[group.kind]}</h2>
		<table>
			<tbody>
				{#each group.entries as entry (entry.slug)}
					<tr>
						<td>
							<span class="name">
								<KindBadge kind={group.kind} short />
								<a href={entry.href} data-sv-internal>{readSymbol(entry.properties)?.name ?? entry.title}</a>
							</span>
						</td>
						<td>{entry.description ?? ''}</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</section>
{/each}

<style>
	section {
		margin-block-end: var(--sv-space-6);
	}

	h2 {
		margin: 0 0 var(--sv-space-2);
		padding-block-end: var(--sv-space-1);
		border-block-end: var(--sv-rule-width) solid var(--sv-rule);
		color: var(--sv-ink);
		font-size: var(--sv-step-2);
		font-weight: 700;
	}

	table {
		inline-size: 100%;
		border-collapse: collapse;
	}

	td {
		padding: var(--sv-space-2) var(--sv-space-4) var(--sv-space-2) 0;
		border-block-end: var(--sv-rule-width) solid var(--sv-rule);
		vertical-align: top;
		font-size: var(--sv-step--1);
	}

	.name {
		display: flex;
		align-items: center;
		gap: var(--sv-space-2);
		white-space: nowrap;
	}

	.name a {
		color: var(--sv-ink);
		font-family: var(--sv-font-mono);
		font-weight: 600;
		text-decoration: none;
	}

	.name a:hover {
		color: var(--sv-accent-text);
	}
</style>
