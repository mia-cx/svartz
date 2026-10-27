<!--
	The vault tree. Folder names link to the folder's page; the chevron beside
	them opens and closes the folder. Open folders persist across visits, and the
	folders above the current page always open. Pages a theme renders show its
	badge and label (`POST /oauth2/token`, `TOOL get_profile`).

	With the theme's `explorerFilter`, a filter above the tree narrows it to
	matches, each with its folders open; clearing the filter brings back the
	reader's own open folders. Enter opens the first match.
-->
<script lang="ts">
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import type { IndexEntry } from '@svartz/core';
	import { Badge, BreakAfterSlashes, explorerOpenIds, type ExplorerNode } from '@svartz/ui';
	import { onMount } from 'svelte';
	import { SvelteSet } from 'svelte/reactivity';
	import type { RegionProps } from '../extension.js';
	import { explorerNotes, filterExplorer } from '../shell.js';

	let { shell }: RegionProps = $props();

	let query = $state('');
	let list: HTMLElement | undefined = $state();
	const filtering = $derived(shell.chrome.explorerFilter && query.trim().length > 0);
	const shown = $derived(filtering ? filterExplorer(shell.tree, query) : shell.tree);
	const matches = $derived(filtering ? explorerNotes(shown).length : 0);
	const forcedOpen = $derived(new Set(shell.trail));

	let expanded = $state(true);
	let stored = $state<readonly string[]>([]);
	// Ancestors the reader closed by hand on this page; they stay closed until navigation.
	const closedAncestors = new SvelteSet<string>();
	onMount(() => explorerOpenIds.subscribe((ids: readonly string[]) => (stored = ids)));
	$effect(() => {
		void shell.currentHref;
		closedAncestors.clear();
	});
	const isOpen = (id: string) => filtering || (forcedOpen.has(id) && !closedAncestors.has(id)) || stored.includes(id);

	function toggle(id: string) {
		const next = new Set(explorerOpenIds.get());
		if (isOpen(id)) {
			next.delete(id);
			closedAncestors.add(id);
		} else {
			next.add(id);
			closedAncestors.delete(id);
		}
		explorerOpenIds.set([...next]);
	}

	// Keep the current page in view when it sits far down a long tree.
	$effect(() => {
		void shell.currentHref;
		list?.querySelector('[aria-current="page"]')?.scrollIntoView({ block: 'nearest' });
	});

	function onkeydown(event: KeyboardEvent) {
		if (event.key === 'Escape' && query) {
			event.preventDefault();
			event.stopPropagation();
			query = '';
		}
		if (event.key === 'Enter' && filtering) {
			event.preventDefault();
			list?.querySelector<HTMLAnchorElement>('a.explorer-note')?.click();
		}
	}

	const current = (href: string) => (href === shell.currentHref ? 'page' : undefined);
</script>

{#snippet branch(nodes: readonly ExplorerNode<IndexEntry>[], depth: number)}
	<ul class="explorer-list" role={depth === 0 ? 'list' : undefined}>
		{#each nodes as node (node.id)}
			<li>
				{#if node.isFolder}
					{@const open = isOpen(node.id)}
					<div class="explorer-folder">
						<button
							class="explorer-chevron"
							type="button"
							aria-expanded={open}
							aria-label="{open ? 'Close' : 'Open'} {node.title}"
							onclick={() => toggle(node.id)}
						>
							<ChevronRight aria-hidden="true" />
						</button>
						<a href={node.href} aria-current={current(node.href)}>{node.title}</a>
					</div>
					<div class="explorer-children" data-open={open ? '' : undefined}>
						<div>{@render branch(node.children, depth + 1)}</div>
					</div>
				{:else}
					<a class="explorer-note" class:item={node.item?.badge} href={node.href} aria-current={current(node.href)}>
						{#if node.item?.badge}<Badge badge={node.item.badge} fixed />{/if}
						<span class="label" class:code={node.item?.badge}><BreakAfterSlashes text={node.item?.label ?? node.title} /></span>
					</a>
				{/if}
			</li>
		{/each}
	</ul>
{/snippet}

<nav class="explorer" aria-labelledby="explorer-heading">
	<button
		class="sv-section-title explorer-toggle"
		id="explorer-heading"
		type="button"
		aria-expanded={expanded}
		aria-controls="explorer-tree"
		onclick={() => (expanded = !expanded)}
	>
		Explorer <ChevronDown aria-hidden="true" />
	</button>
	{#if shell.chrome.explorerFilter}
		<div class="filter">
			<label class="sv-visually-hidden" for="sv-explorer-filter">Filter pages</label>
			<input
				bind:value={query}
				id="sv-explorer-filter"
				type="search"
				placeholder="Filter"
				autocomplete="off"
				spellcheck="false"
				{onkeydown}
			/>
			<p class="sv-visually-hidden" role="status">{filtering ? `${matches} ${matches === 1 ? 'page matches' : 'pages match'}` : ''}</p>
		</div>
	{/if}
	<div class="explorer-tree" id="explorer-tree" hidden={!expanded} bind:this={list}>
		{#if shown.length > 0}
			{@render branch(shown, 0)}
		{:else if filtering}
			<p class="empty">No pages match “{query.trim()}”.</p>
		{/if}
	</div>
</nav>

<style>
	.explorer {
		font-size: var(--sv-step--1);
	}

	.explorer-toggle {
		margin-block-end: var(--sv-space-3);
	}

	/* Phones open the explorer from the menu drawer instead. */
	@media (max-width: 50rem) {
		.explorer-toggle {
			display: none;
		}

		.explorer-tree[hidden] {
			display: block;
		}
	}

	.filter {
		margin-block-end: var(--sv-space-3);
	}

	.filter input {
		box-sizing: border-box;
		inline-size: 100%;
		padding: var(--sv-space-1) var(--sv-space-2);
		border: var(--sv-rule-width) solid var(--sv-rule);
		border-radius: var(--sv-radius-m);
		background: var(--sv-paper);
		color: var(--sv-ink);
		font: inherit;
	}

	.filter input::placeholder {
		color: var(--sv-muted);
	}

	.filter input:hover {
		border-color: var(--sv-rule-strong);
	}

	.empty {
		margin: 0;
		color: var(--sv-muted);
	}

	.explorer-list {
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.explorer-children .explorer-list {
		margin-inline-start: 0.7rem;
		padding-inline-start: var(--sv-space-2);
		border-inline-start: var(--sv-rule-width) solid var(--sv-rule);
	}

	.explorer-folder {
		display: flex;
		align-items: center;
		margin-inline-start: -0.35rem;
	}

	.explorer-chevron {
		display: grid;
		flex: none;
		place-items: center;
		inline-size: 1.4rem;
		block-size: 1.6rem;
		padding: 0;
		border: 0;
		border-radius: var(--sv-radius-s);
		background: none;
		color: var(--sv-muted);
		cursor: pointer;
	}

	.explorer-chevron:hover {
		color: var(--sv-ink);
	}

	.explorer-chevron :global(svg) {
		inline-size: 0.9rem;
		block-size: 0.9rem;
		transition: rotate var(--sv-duration) var(--sv-ease);
	}

	.explorer-chevron[aria-expanded='true'] :global(svg) {
		rotate: 90deg;
	}

	a {
		display: block;
		padding: 0.18rem 0.35rem;
		border-radius: var(--sv-radius-s);
		color: var(--sv-text);
		line-height: 1.35;
		text-decoration: none;
		transition: color var(--sv-duration-fast) var(--sv-ease);
	}

	a.item {
		display: flex;
		align-items: baseline;
		gap: var(--sv-space-2);
	}

	.label {
		min-inline-size: 0;
		overflow-wrap: anywhere;
	}

	.label.code {
		font-family: var(--sv-font-mono);
		font-size: 0.92em;
	}

	.explorer-folder a {
		flex: 1;
		min-inline-size: 0;
		color: var(--sv-ink);
		font-weight: 600;
	}

	a:hover {
		color: var(--sv-accent-text);
	}

	a[aria-current='page'] {
		color: var(--sv-ink);
		font-weight: 600;
		box-shadow: inset 2px 0 0 var(--sv-accent);
		border-radius: 0;
	}

	.explorer-children {
		display: grid;
		grid-template-rows: 0fr;
		visibility: hidden;
		transition:
			grid-template-rows var(--sv-duration) var(--sv-ease),
			visibility 0s linear var(--sv-duration);
	}

	.explorer-children[data-open] {
		grid-template-rows: 1fr;
		visibility: visible;
		transition: grid-template-rows var(--sv-duration) var(--sv-ease);
	}

	.explorer-children > div {
		overflow: hidden;
	}
</style>
