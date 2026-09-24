<!--
	The vault tree. Folder names link to the folder's page; the chevron beside
	them opens and closes the folder. Open folders persist across visits, and the
	folders above the current note always open.
-->
<script lang="ts">
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import {
		ancestorFolderIdsForSlug,
		buildExplorerTree,
		explorerOpenIds,
		type ExplorerNode,
		type UiFolderEntry,
		type UiIndexEntry
	} from '@svartz/ui';
	import { onMount } from 'svelte';
	import { SvelteSet } from 'svelte/reactivity';

	let {
		entries,
		folders,
		currentHref
	}: {
		entries: readonly UiIndexEntry[];
		folders: readonly UiFolderEntry[];
		currentHref: string | undefined;
	} = $props();

	const tree = $derived(buildExplorerTree(entries, folders));
	const currentSlug = $derived(entries.find((entry) => entry.href === currentHref)?.slug);
	// On a folder page, that folder opens too.
	const currentFolder = $derived(folders.find((folder) => folder.href === currentHref)?.slug);
	const forcedOpen = $derived(new Set(ancestorFolderIdsForSlug(currentFolder ?? currentSlug)));

	let expanded = $state(true);
	let stored = $state<readonly string[]>([]);
	// Ancestors the reader closed by hand on this page; they stay closed until navigation.
	const closedAncestors = new SvelteSet<string>();
	onMount(() => explorerOpenIds.subscribe((ids: readonly string[]) => (stored = ids)));
	$effect(() => {
		void currentHref;
		closedAncestors.clear();
	});
	const isOpen = (id: string) => (forcedOpen.has(id) && !closedAncestors.has(id)) || stored.includes(id);

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
</script>

{#snippet branch(nodes: readonly ExplorerNode[], depth: number)}
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
						<a href={node.href} aria-current={node.href === currentHref ? 'page' : undefined}>{node.title}</a>
					</div>
					<div class="explorer-children" data-open={open ? '' : undefined}>
						<div>{@render branch(node.children, depth + 1)}</div>
					</div>
				{:else}
					<a class="explorer-note" href={node.href} aria-current={node.href === currentHref ? 'page' : undefined}>
						{node.title}
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
	<div class="explorer-tree" id="explorer-tree" hidden={!expanded}>
		{@render branch(tree, 0)}
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
