<script lang="ts">
	import { titleFromSlugSegment } from '@svartz/ui';

	type Entry = {
		slug: string;
		href?: string;
		title: string;
		description?: string;
	};
	type Folder = { slug: string; noteSlugs: readonly string[] };

	let {
		match,
		index = { entries: [], folders: [] },
		vault
	}: {
		match?: { params?: { slug?: string } };
		index?: { entries: readonly Entry[]; folders: readonly Folder[] };
		vault?: { entries: readonly Entry[]; folders: readonly Folder[] };
	} = $props();

	const currentFolder = $derived(match?.params?.slug ?? '');
	const title = $derived(
		currentFolder
			? titleFromSlugSegment(currentFolder.split('/').at(-1) ?? currentFolder)
			: 'Folder'
	);
	const entries = $derived.by(() => {
		const folder = (vault?.folders ?? index.folders).find((item) => item.slug === currentFolder);
		const members = new Set(folder?.noteSlugs ?? []);
		return (vault?.entries ?? index.entries).filter((entry) => members.has(entry.slug));
	});
</script>

<section class="grid gap-4">
	<div>
		<h1 class="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
			{title}
		</h1>
		<p class="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
			{entries.length}
			{entries.length === 1 ? 'note' : 'notes'} in this folder.
		</p>
	</div>
	<ul class="grid gap-0">
		{#each entries as entry (entry.slug)}
			<li class="grid gap-1 border-b border-zinc-100 py-3 last:border-0 dark:border-zinc-800">
				<a
					href={entry.href ?? (entry.slug === 'index' ? '/' : '/' + entry.slug + '/')}
					class="font-medium text-zinc-900 transition-colors hover:text-blue-600 dark:text-zinc-100 dark:hover:text-blue-400"
				>
					{entry.title}
				</a>
				{#if entry.description}
					<span class="text-sm text-zinc-500 dark:text-zinc-400">{entry.description}</span>
				{/if}
			</li>
		{/each}
	</ul>
</section>
