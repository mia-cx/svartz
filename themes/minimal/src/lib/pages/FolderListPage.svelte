<script lang="ts">
	type FolderEntry = {
		slug: string;
		title: string;
		noteCount: number;
		href: string;
	};

	let { folders = [] }: { folders?: readonly FolderEntry[] } = $props();
</script>

<section class="grid gap-4">
	<div>
		<h1 class="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">Folders</h1>
		<p class="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
			{folders.length} folders in this vault.
		</p>
	</div>
	<ul class="grid gap-0">
		{#each folders as folder (folder.slug)}
			<li
				class="flex items-center justify-between gap-4 border-b border-zinc-100 py-3 last:border-0 dark:border-zinc-800"
			>
				<a
					href={folder.href}
					class="font-medium text-zinc-900 transition-colors hover:text-blue-600 dark:text-zinc-100 dark:hover:text-blue-400"
				>
					{folder.title}
				</a>
				<span
					class="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400"
				>
					{folder.noteCount}
				</span>
			</li>
		{/each}
	</ul>
</section>
