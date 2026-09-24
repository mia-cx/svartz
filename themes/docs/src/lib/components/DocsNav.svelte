<!--
	The reference sidebar: guides first, then each module with its symbols grouped
	by kind. Each symbol carries a one-letter kind badge.
-->
<script lang="ts">
	import type { FolderIndexEntry, IndexEntry } from '@svartz/core';
	import KindBadge from './KindBadge.svelte';
	import { groupByKind, KIND_HEADINGS, readSymbol, symbolNav } from '../symbols.js';

	let {
		entries,
		folders,
		currentHref
	}: { entries: readonly IndexEntry[]; folders: readonly FolderIndexEntry[]; currentHref: string } = $props();

	const sections = $derived(symbolNav(entries, folders));
	const current = (href: string) => (href === currentHref ? 'page' : undefined);
</script>

<nav class="docs-nav" aria-label="Reference">
	{#each sections as section (section.title)}
		<section>
			<h2 class="sv-section-title">
				{#if section.href}<a href={section.href} aria-current={current(section.href)}>{section.title}</a>{:else}{section.title}{/if}
			</h2>
			{#if section.symbols}
				{#each groupByKind(section.entries) as group (group.kind)}
					<p class="sv-label kind">{KIND_HEADINGS[group.kind]}</p>
					<ul>
						{#each group.entries as entry (entry.slug)}
							<li>
								<a class="symbol" href={entry.href} aria-current={current(entry.href)}>
									<KindBadge kind={group.kind} short />
									<span>{readSymbol(entry.properties)?.name ?? entry.title}</span>
								</a>
							</li>
						{/each}
					</ul>
				{/each}
			{:else}
				<ul>
					{#each section.entries as entry (entry.slug)}
						<li><a href={entry.href} aria-current={current(entry.href)}>{entry.title}</a></li>
					{/each}
				</ul>
			{/if}
		</section>
	{/each}
</nav>

<style>
	.docs-nav {
		display: grid;
		gap: var(--sv-space-5);
		font-size: var(--sv-step--1);
	}

	h2 a {
		color: inherit;
		text-decoration: none;
	}

	.kind {
		margin: var(--sv-space-2) 0 var(--sv-space-1);
	}

	ul {
		display: grid;
		gap: 1px;
		margin: var(--sv-space-1) 0 0;
		padding: 0;
		list-style: none;
	}

	a {
		display: flex;
		align-items: center;
		gap: var(--sv-space-2);
		padding: 0.2rem var(--sv-space-2);
		margin-inline: calc(-1 * var(--sv-space-2));
		border-radius: var(--sv-radius-s);
		color: var(--sv-text);
		text-decoration: none;
	}

	a:hover {
		background: var(--sv-surface);
		color: var(--sv-ink);
	}

	a[aria-current] {
		background: var(--sv-surface);
		color: var(--sv-ink);
		font-weight: 600;
		box-shadow: inset 2px 0 0 var(--sv-accent);
	}

	.symbol span {
		overflow: hidden;
		font-family: var(--sv-font-mono);
		font-size: 0.95em;
		text-overflow: ellipsis;
	}
</style>
