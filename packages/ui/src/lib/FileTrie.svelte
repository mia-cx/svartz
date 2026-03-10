<script lang="ts">
	import { buildExplorerTree, ancestorFolderIdsForSlug, type ExplorerNode, type UiIndexEntry } from './navigation';
	import { explorerOpenIds } from './stores';

	let { entries = [], currentSlug }: { entries?: readonly UiIndexEntry[]; currentSlug?: string } = $props();
	const tree = $derived(buildExplorerTree(entries));

	const forceOpenIds = $derived(ancestorFolderIdsForSlug(currentSlug));
	let storedOpenIds = $state<string[]>(explorerOpenIds.get());
	$effect(() => {
		const unsub = explorerOpenIds.subscribe((v) => {
			storedOpenIds = [...v];
		});
		return unsub;
	});
	const openIds = $derived.by(() => {
		const set = new Set(storedOpenIds);
		for (const id of forceOpenIds) set.add(id);
		return set;
	});

	function toggle(id: string) {
		const next = new Set(explorerOpenIds.get());
		if (next.has(id)) next.delete(id);
		else next.add(id);
		explorerOpenIds.set([...next]);
	}
</script>

<nav class="grid gap-1.5" aria-label="Explorer">
	<p class="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
		Explorer
	</p>

	{#snippet renderNodes(nodes: readonly ExplorerNode[], depth: number)}
		<ul class="grid gap-0.5 {depth > 0 ? 'ml-3 border-l border-zinc-200 pl-2 dark:border-zinc-700' : ''}">
			{#each nodes as node (node.id)}
				<li>
					{#if node.isFolder}
						<button
							type="button"
							onclick={() => toggle(node.id)}
							aria-expanded={openIds.has(node.id)}
							class="flex w-full items-center gap-1.5 rounded px-1.5 py-1 text-left text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
						>
							<svg
								class="size-3 shrink-0 transition-transform {openIds.has(node.id)
									? 'rotate-90'
									: ''}"
								xmlns="http://www.w3.org/2000/svg"
								viewBox="0 0 20 20"
								fill="currentColor"
								aria-hidden="true"
							>
								<path
									fill-rule="evenodd"
									d="M8.22 5.22a.75.75 0 0 1 1.06 0l4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.75.75 0 0 1-1.06-1.06L11.94 10 8.22 6.28a.75.75 0 0 1 0-1.06Z"
									clip-rule="evenodd"
								/>
							</svg>
							{node.title}
						</button>
						{#if openIds.has(node.id) && node.children.length > 0}
							{@render renderNodes(node.children, depth + 1)}
						{/if}
					{:else}
						<a
							href={node.href}
							class="flex items-center rounded px-1.5 py-1 text-sm text-zinc-600 transition-colors hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
						>
							{node.title}
						</a>
					{/if}
				</li>
			{/each}
		</ul>
	{/snippet}

	{@render renderNodes(tree, 0)}
</nav>
