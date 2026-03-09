<script lang="ts">
	type Entry = {
		title: string;
		description?: string;
		createdAt?: Date;
		modifiedAt?: Date;
		tags?: readonly string[];
		wordCount?: number;
	};

	let { entry }: { entry?: Entry } = $props();

	function formatDate(value: Date | undefined): string | undefined {
		return value
			? value.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
			: undefined;
	}

	const createdAt = $derived(formatDate(entry?.createdAt));
	const modifiedAt = $derived(formatDate(entry?.modifiedAt));
	const readingTime = $derived(
		entry?.wordCount != null ? Math.max(1, Math.ceil(entry.wordCount / 200)) : undefined
	);
</script>

{#if entry}
	<header class="grid gap-3">
		<h1 class="text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50 sm:text-4xl">
			{entry.title}
		</h1>

		{#if createdAt || modifiedAt || readingTime}
			<p class="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-zinc-500 dark:text-zinc-400">
				{#if createdAt}
					<span>Created {createdAt}</span>
				{/if}
				{#if createdAt && modifiedAt}
					<span aria-hidden="true" class="text-zinc-300 dark:text-zinc-600">·</span>
				{/if}
				{#if modifiedAt}
					<span>Updated {modifiedAt}</span>
				{/if}
				{#if (createdAt || modifiedAt) && readingTime}
					<span aria-hidden="true" class="text-zinc-300 dark:text-zinc-600">·</span>
				{/if}
				{#if readingTime}
					<span>{readingTime} min read</span>
				{/if}
			</p>
		{/if}

		{#if entry.description}
			<p class="text-base leading-relaxed text-zinc-600 dark:text-zinc-400">
				{entry.description}
			</p>
		{/if}

		{#if entry.tags && entry.tags.length > 0}
			<ul class="flex flex-wrap gap-1.5" aria-label="Tags">
				{#each entry.tags as tag (tag)}
					<li>
						<a
							href={'/tags/' + tag + '/'}
							class="inline-flex rounded-full border border-zinc-200 bg-zinc-100 px-2.5 py-0.5 text-xs font-medium text-zinc-700 transition-colors hover:border-zinc-300 hover:bg-zinc-200 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:border-zinc-600 dark:hover:bg-zinc-700"
						>
							#{tag}
						</a>
					</li>
				{/each}
			</ul>
		{/if}
	</header>
{/if}
