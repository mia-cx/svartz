<script lang="ts">
	type TagEntry = {
		slug: string;
		title: string;
		noteCount: number;
		href: string;
	};

	let { tags = [] }: { tags?: readonly TagEntry[] } = $props();
</script>

<section class="grid gap-4">
	<div>
		<h1 class="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">Tags</h1>
		<p class="mt-1 text-sm text-zinc-500 dark:text-zinc-400">{tags.length} tags in this vault.</p>
	</div>
	<ul class="grid gap-0">
		{#each tags as tag (tag.slug)}
			<li
				class="flex items-center justify-between gap-4 border-b border-zinc-100 py-3 last:border-0 dark:border-zinc-800"
			>
				<a
					href={tag.href}
					class="font-medium text-zinc-900 transition-colors hover:text-blue-600 dark:text-zinc-100 dark:hover:text-blue-400"
				>
					#{tag.title}
				</a>
				<span
					class="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400"
				>
					{tag.noteCount}
				</span>
			</li>
		{/each}
	</ul>
</section>
