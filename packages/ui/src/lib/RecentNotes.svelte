<script lang="ts">
	type Entry = {
		slug: string;
		title: string;
		description?: string;
		createdAt?: Date;
		modifiedAt?: Date;
		tags?: readonly string[];
	};

	let {
		entries = [],
		limit = 3,
		title = 'Recent Notes',
		showTags = true,
		linkToMore
	}: {
		entries?: readonly Entry[];
		limit?: number;
		title?: string;
		showTags?: boolean;
		linkToMore?: string;
	} = $props();

	function formatDate(d: Date): string {
		return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
	}

	function slugToHref(slug: string) {
		return slug === 'index' ? '/' : `/${slug}/`;
	}

	const sorted = $derived(
		[...entries]
			.sort((a, b) => {
				const ta = (a.modifiedAt ?? a.createdAt)?.getTime() ?? 0;
				const tb = (b.modifiedAt ?? b.createdAt)?.getTime() ?? 0;
				return tb - ta || a.title.localeCompare(b.title);
			})
			.slice(0, limit)
	);

	const remaining = $derived(Math.max(0, entries.length - limit));
</script>

{#if sorted.length > 0}
	<section class="grid gap-2" aria-label={title}>
		<p class="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
			{title}
		</p>
		<ul class="grid gap-3">
			{#each sorted as entry (entry.slug)}
				{@const date = entry.modifiedAt ?? entry.createdAt}
				<li class="grid gap-1">
					<a
						href={slugToHref(entry.slug)}
						class="text-sm font-medium leading-snug text-zinc-800 transition-colors hover:text-zinc-900 dark:text-zinc-200 dark:hover:text-zinc-50"
					>
						{entry.title}
					</a>
					{#if date}
						<time
							datetime={date.toISOString()}
							class="text-xs text-zinc-400 dark:text-zinc-500"
						>
							{formatDate(date)}
						</time>
					{/if}
					{#if showTags && entry.tags && entry.tags.length > 0}
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
				</li>
			{/each}
		</ul>
		{#if linkToMore && remaining > 0}
			<a
				href={linkToMore}
				class="mt-1 text-xs font-medium text-zinc-500 transition-colors hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
			>
				See {remaining} more →
			</a>
		{/if}
	</section>
{/if}
