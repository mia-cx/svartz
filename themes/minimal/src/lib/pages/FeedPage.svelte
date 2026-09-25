<script lang="ts">
	type Entry = {
		slug: string;
		title: string;
		description?: string;
		tags?: readonly string[];
		modifiedAt?: Date | string;
		createdAt?: Date | string;
		readingTimeMinutes?: number;
	};

	let {
		index = { entries: [] }
	}: {
		index?: { entries: readonly Entry[] };
	} = $props();

	/**
	 * If the vault contains a `feed.md` or `feed/index.md`, treat it as the
	 * page header (title + description). Exclude it from the note list.
	 */
	const META_SLUGS = ['feed', 'feed/index'];

	const metaEntry = $derived(
		index.entries.find((e) => META_SLUGS.includes(e.slug))
	);

	const feedTitle = $derived(metaEntry?.title ?? 'Feed');
	const feedDescription = $derived(metaEntry?.description);

	function noteDate(entry: Entry): Date | undefined {
		const value = entry.modifiedAt ?? entry.createdAt;
		return value ? new Date(value) : undefined;
	}

	function formatDate(d: Date): string {
		return d.toLocaleDateString(undefined, {
			year: 'numeric',
			month: 'short',
			day: 'numeric'
		});
	}

	function slugToHref(slug: string): string {
		return slug === 'index' ? '/' : `/${slug}/`;
	}

	const notes = $derived(
		[...index.entries]
			.filter((e) => !META_SLUGS.includes(e.slug))
			.sort((a, b) => {
				const ta = noteDate(a)?.getTime() ?? 0;
				const tb = noteDate(b)?.getTime() ?? 0;
				return tb - ta;
			})
	);
</script>

<section class="grid gap-6">
	<div>
		<h1 class="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
			{feedTitle}
		</h1>
		{#if feedDescription}
			<p class="mt-1 text-sm text-zinc-500 dark:text-zinc-400">{feedDescription}</p>
		{:else}
			<p class="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
				{notes.length} {notes.length === 1 ? 'note' : 'notes'}, newest first.
			</p>
		{/if}
	</div>

	<ul class="grid gap-0">
		{#each notes as entry (entry.slug)}
			{@const date = noteDate(entry)}
			<li class="grid gap-1.5 border-b border-zinc-100 py-4 last:border-0 dark:border-zinc-800">
				<div class="flex min-w-0 flex-col items-start gap-1 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
					<a
						href={slugToHref(entry.slug)}
						class="min-w-0 [overflow-wrap:anywhere] font-medium leading-snug text-zinc-900 transition-colors hover:text-blue-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-600 dark:text-zinc-100 dark:hover:text-blue-400"
					>
						{entry.title}
					</a>
					{#if date}
						<time
							datetime={date.toISOString()}
							class="shrink-0 text-xs text-zinc-400 dark:text-zinc-500"
						>
							{formatDate(date)}
						</time>
					{/if}
				</div>
				{#if entry.description}
					<p class="text-sm text-zinc-500 dark:text-zinc-400">{entry.description}</p>
				{/if}
				<div class="flex flex-wrap items-center gap-x-3 gap-y-1">
					{#if entry.readingTimeMinutes}
						<span class="text-xs text-zinc-400 dark:text-zinc-500">
							{entry.readingTimeMinutes} min read
						</span>
					{/if}
					{#if entry.tags && entry.tags.length > 0}
						<div class="flex flex-wrap gap-1">
							{#each entry.tags as tag (tag)}
								<a
									href={'/tags/' + tag + '/'}
									class="rounded-full border border-zinc-200 bg-zinc-100 px-1.5 py-0.5 text-[10px] font-medium text-zinc-600 transition-colors hover:border-zinc-300 hover:text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-100"
								>
									#{tag}
								</a>
							{/each}
						</div>
					{/if}
				</div>
			</li>
		{/each}
	</ul>
</section>
