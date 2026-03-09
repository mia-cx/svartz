<script lang="ts">
	type Entry = { slug: string; title: string };

	let { currentSlug, entries = [], graph = {} }: {
		currentSlug?: string;
		entries?: readonly Entry[];
		graph?: Record<string, readonly string[]>;
	} = $props();

	const neighbors = $derived(
		(currentSlug ? graph[currentSlug] ?? [] : [])
			.map((slug) => entries.find((entry) => entry.slug === slug))
			.filter(Boolean) as Entry[]
	);
</script>

{#if neighbors.length > 0}
	<section class="graph-panel" aria-label="Graph view">
		<h2>Graph View</h2>
		<ul>
			{#each neighbors as neighbor (neighbor.slug)}
				<li><a href={neighbor.slug === 'index' ? '/' : '/' + neighbor.slug + '/'}>{neighbor.title}</a></li>
			{/each}
		</ul>
	</section>
{/if}

<style>
	.graph-panel {
		display: grid;
		gap: 0.75rem;
	}

	h2 {
		margin: 0;
		font-size: 0.95rem;
	}

	ul {
		list-style: none;
		padding: 0;
		margin: 0;
		display: grid;
		gap: 0.4rem;
	}

	a {
		color: var(--svartz-muted, #cbd5e1);
		text-decoration: none;
	}

	a:hover {
		text-decoration: underline;
	}
</style>
