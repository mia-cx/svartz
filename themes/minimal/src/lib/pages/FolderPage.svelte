<script lang="ts">
	import { titleFromSlugSegment } from '@svartz/ui';

	type Entry = {
		slug: string;
		title: string;
		description?: string;
	};

	let { match, index = { entries: [] } }: {
		match?: { params?: { slug?: string } };
		index?: { entries: readonly Entry[] };
	} = $props();

	const currentFolder = $derived(match?.params?.slug ?? '');
	const title = $derived(
		currentFolder
			? titleFromSlugSegment(currentFolder.split('/').at(-1) ?? currentFolder)
			: 'Folder'
	);
	const entries = $derived(
		index.entries.filter(
			(entry) => entry.slug === currentFolder || entry.slug.startsWith(currentFolder + '/')
		)
	);
</script>

<section class="list-page">
	<h1>Folder: {title}</h1>
	<p>{entries.length} notes in this folder.</p>
	<ul>
		{#each entries as entry (entry.slug)}
			<li>
				<a href={entry.slug === 'index' ? '/' : '/' + entry.slug + '/'}>{entry.title}</a>
				{#if entry.description}<span>{entry.description}</span>{/if}
			</li>
		{/each}
	</ul>
</section>

<style>
	.list-page {
		display: grid;
		gap: 1rem;
	}

	h1,
	p,
	ul {
		margin: 0;
	}

	ul {
		list-style: none;
		padding: 0;
		display: grid;
		gap: 0.85rem;
	}

	li {
		display: grid;
		gap: 0.3rem;
		padding-bottom: 0.85rem;
		border-bottom: 1px solid rgba(255, 255, 255, 0.08);
	}

	a {
		text-decoration: none;
		color: inherit;
		font-weight: 600;
	}

	span {
		color: #94a3b8;
	}
</style>
