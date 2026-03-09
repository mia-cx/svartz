<script lang="ts">
	import MiniSearch from 'minisearch';

	type SearchDocument = {
		id: string;
		slug: string;
		title: string;
		description?: string;
		tags?: readonly string[];
	};

	let {
		searchDocuments = [],
		searchIndex
	}: {
		searchDocuments?: readonly SearchDocument[];
		searchIndex?: unknown;
	} = $props();

	let open = $state(false);
	let query = $state('');

	const options = {
		fields: ['title', 'description', 'content', 'tags', 'aliases'],
		storeFields: ['slug', 'title', 'description', 'tags'],
		idField: 'id'
	} as const;

	const engine = $derived(
		searchIndex ? MiniSearch.loadJS(searchIndex as never, options) : undefined
	);
	const results = $derived(
		query.trim().length < 2 || !engine
			? []
			: (engine.search(query, { prefix: true, fuzzy: 0.2 }).slice(0, 8) as SearchDocument[])
	);
</script>

<div class="search-box">
	<button type="button" aria-label="Open search" onclick={() => (open = !open)}>Search</button>
	{#if open}
		<div class="panel">
			<input bind:value={query} aria-label="Search notes" placeholder="Search notes" />
			{#if query.trim().length < 2}
				<p class="hint">Type at least 2 characters.</p>
			{:else if results.length > 0}
				<ul>
					{#each results as result (result.id)}
						<li>
							<a href={result.slug === 'index' ? '/' : '/' + result.slug + '/'}>
								<strong>{result.title}</strong>
								{#if result.description}<span>{result.description}</span>{/if}
							</a>
						</li>
					{/each}
				</ul>
			{:else}
				<p class="hint">No matches found.</p>
			{/if}
		</div>
	{/if}
</div>

<style>
	.search-box {
		display: grid;
		gap: 0.6rem;
	}

	button,
	input {
		border: 1px solid rgba(255, 255, 255, 0.12);
		background: var(--svartz-panel, rgba(255, 255, 255, 0.04));
		color: var(--svartz-text, #f8fafc);
		border-radius: 0.5rem;
		padding: 0.65rem 0.8rem;
		font: inherit;
	}

	.panel {
		display: grid;
		gap: 0.75rem;
	}

	ul {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: 0.5rem;
	}

	a {
		display: grid;
		gap: 0.25rem;
		text-decoration: none;
		color: inherit;
		padding: 0.5rem;
		border-radius: 0.5rem;
	}

	a:hover {
		background: rgba(255, 255, 255, 0.05);
	}

	span,
	.hint {
		color: var(--svartz-muted, #94a3b8);
		font-size: 0.85rem;
	}
</style>
