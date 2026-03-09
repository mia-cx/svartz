<script lang="ts">
	type Entry = {
		title: string;
		description?: string;
		createdAt?: Date;
		modifiedAt?: Date;
		tags?: readonly string[];
	};

	let { entry }: { entry?: Entry } = $props();

	function formatDate(value: Date | undefined): string | undefined {
		return value
			? value.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
			: undefined;
	}

	const createdAt = $derived(formatDate(entry?.createdAt));
	const modifiedAt = $derived(formatDate(entry?.modifiedAt));
</script>

{#if entry}
	<header class="note-header">
		<h1>{entry.title}</h1>
		{#if createdAt || modifiedAt}
			<p class="meta">
				{#if createdAt}Created {createdAt}{/if}
				{#if createdAt && modifiedAt}<span aria-hidden="true"> • </span>{/if}
				{#if modifiedAt}Updated {modifiedAt}{/if}
			</p>
		{/if}
		{#if entry.description}
			<p class="description">{entry.description}</p>
		{/if}
		{#if entry.tags && entry.tags.length > 0}
			<ul class="tags" aria-label="Tags">
				{#each entry.tags as tag (tag)}
					<li><a href={'/tags/' + tag + '/'}>#{tag}</a></li>
				{/each}
			</ul>
		{/if}
	</header>
{/if}

<style>
	.note-header {
		display: grid;
		gap: 0.75rem;
	}

	h1 {
		margin: 0;
		font-size: clamp(1.8rem, 4vw, 2.5rem);
		line-height: 1.1;
	}

	.meta,
	.description {
		margin: 0;
		color: var(--svartz-muted, #9ca3af);
	}

	.tags {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		list-style: none;
		padding: 0;
		margin: 0;
	}

	.tags a {
		display: inline-flex;
		padding: 0.2rem 0.5rem;
		border-radius: 999px;
		background: var(--svartz-panel, rgba(255, 255, 255, 0.05));
		color: var(--svartz-muted, #9ca3af);
		text-decoration: none;
		font-size: 0.82rem;
	}
</style>
