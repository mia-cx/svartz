<script lang="ts">
	type TocEntry = {
		depth: number;
		text: string;
		slug: string;
	};

	let { items = [] }: { items?: readonly TocEntry[] } = $props();
</script>

{#if items.length > 0}
	<nav class="toc" aria-label="Table of contents">
		<h2>Table of Contents</h2>
		<ol>
			{#each items as item (item.slug)}
				<li style={`--depth:${item.depth};`}>
					<a href={'#' + item.slug}>{item.text}</a>
				</li>
			{/each}
		</ol>
	</nav>
{/if}

<style>
	.toc {
		display: grid;
		gap: 0.75rem;
	}

	h2 {
		margin: 0;
		font-size: 0.95rem;
	}

	ol {
		list-style: none;
		padding: 0;
		margin: 0;
		display: grid;
		gap: 0.4rem;
	}

	li {
		padding-left: calc(var(--depth, 0) * 0.75rem);
		font-size: 0.85rem;
	}

	a {
		color: var(--svartz-muted, #cbd5e1);
		text-decoration: none;
	}

	a:hover {
		text-decoration: underline;
	}
</style>
