<script lang="ts">
	type Entry = {
		slug: string;
		title: string;
	};

	let { currentSlug, entries = [], backlinks = {} }: {
		currentSlug?: string;
		entries?: readonly Entry[];
		backlinks?: Record<string, readonly string[]>;
	} = $props();

	const linkedEntries = $derived(
		(currentSlug ? backlinks[currentSlug] ?? [] : [])
			.map((slug) => entries.find((entry) => entry.slug === slug))
			.filter(Boolean) as Entry[]
	);
</script>

{#if linkedEntries.length > 0}
	<section class="backlinks" aria-label="Backlinks">
		<h2>Backlinks</h2>
		<ul>
			{#each linkedEntries as entry (entry.slug)}
				<li><a href={entry.slug === 'index' ? '/' : '/' + entry.slug + '/'}>{entry.title}</a></li>
			{/each}
		</ul>
	</section>
{/if}

<style>
	.backlinks {
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
		gap: 0.45rem;
	}

	a {
		color: var(--svartz-muted, #cbd5e1);
		text-decoration: none;
	}

	a:hover {
		text-decoration: underline;
	}
</style>
