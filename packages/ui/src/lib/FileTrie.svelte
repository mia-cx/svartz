<script lang="ts">
	import { buildExplorerTree, type ExplorerNode, type UiIndexEntry } from './navigation';

	let { entries = [] }: { entries?: readonly UiIndexEntry[] } = $props();
	const tree = $derived(buildExplorerTree(entries));
</script>

<nav class="explorer" aria-label="Explorer">
	<h2>Explorer</h2>

	{#snippet renderNodes(nodes: readonly ExplorerNode[])}
		<ul>
			{#each nodes as node (node.id)}
				<li class:folder={node.isFolder}>
					<a href={node.href}>{node.title}</a>
					{#if node.children.length > 0}
						{@render renderNodes(node.children)}
					{/if}
				</li>
			{/each}
		</ul>
	{/snippet}

	{@render renderNodes(tree)}
</nav>

<style>
	.explorer {
		display: grid;
		gap: 0.75rem;
	}

	h2 {
		margin: 0;
		font-size: 0.95rem;
	}

	ul {
		list-style: none;
		padding-left: 0.85rem;
		margin: 0;
		display: grid;
		gap: 0.35rem;
		border-left: 1px solid rgba(255, 255, 255, 0.08);
	}

	.explorer > ul {
		padding-left: 0;
		border-left: 0;
	}

	li {
		display: grid;
		gap: 0.35rem;
	}

	li.folder > a {
		font-weight: 600;
	}

	a {
		color: var(--svartz-muted, #cbd5e1);
		text-decoration: none;
	}

	a:hover {
		text-decoration: underline;
	}
</style>
