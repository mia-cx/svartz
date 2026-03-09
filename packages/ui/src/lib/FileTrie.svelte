<script lang="ts">
	import { buildExplorerTree, type ExplorerNode, type UiIndexEntry } from './navigation';

	let { entries = [] }: { entries?: readonly UiIndexEntry[] } = $props();
	const tree = $derived(buildExplorerTree(entries));

	let openIds = $state(new Set<string>());

	function toggle(id: string) {
		const next = new Set(openIds);
		if (next.has(id)) {
			next.delete(id);
		} else {
			next.add(id);
		}
		openIds = next;
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
							<svg
								class="size-3.5 shrink-0 text-zinc-400 dark:text-zinc-500"
								xmlns="http://www.w3.org/2000/svg"
								viewBox="0 0 20 20"
								fill="currentColor"
								aria-hidden="true"
							>
								{#if openIds.has(node.id)}
									<path
										d="M2 8a1 1 0 0 1 1-1h1.5A1.5 1.5 0 0 0 6 5.5V5a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v.5A1.5 1.5 0 0 0 15.5 7H17a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V8Z"
									/>
								{:else}
									<path
										d="M2 8a1 1 0 0 1 1-1h1.5A1.5 1.5 0 0 0 6 5.5V5a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v.5A1.5 1.5 0 0 0 15.5 7H17a1 1 0 0 1 1 1v1H2V8Z"
									/>
									<path
										d="M2 11.5a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1V10H2v1.5Z"
										opacity=".5"
									/>
									<path d="M2 10h16v5a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1v-5Z" opacity=".3" />
								{/if}
							</svg>
							{node.title}
						</button>
						{#if openIds.has(node.id) && node.children.length > 0}
							{@render renderNodes(node.children, depth + 1)}
						{/if}
					{:else}
						<a
							href={node.href}
							class="flex items-center gap-1.5 rounded px-1.5 py-1 text-sm text-zinc-600 transition-colors hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
						>
							<svg
								class="size-3.5 shrink-0 text-zinc-400 dark:text-zinc-500"
								xmlns="http://www.w3.org/2000/svg"
								viewBox="0 0 20 20"
								fill="currentColor"
								aria-hidden="true"
							>
								<path
									d="M10.75 2.75a.75.75 0 0 0-1.5 0v8.614L6.295 8.235a.75.75 0 1 0-1.09 1.03l4.25 4.5a.75.75 0 0 0 1.09 0l4.25-4.5a.75.75 0 0 0-1.09-1.03l-2.955 3.129V2.75Z"
								/>
								<path
									d="M3.5 12.75a.75.75 0 0 0-1.5 0v2.5A2.75 2.75 0 0 0 4.75 18h10.5A2.75 2.75 0 0 0 18 15.25v-2.5a.75.75 0 0 0-1.5 0v2.5c0 .69-.56 1.25-1.25 1.25H4.75c-.69 0-1.25-.56-1.25-1.25v-2.5Z"
								/>
							</svg>
							{node.title}
						</a>
					{/if}
				</li>
			{/each}
		</ul>
	{/snippet}

	{@render renderNodes(tree, 0)}
</nav>
