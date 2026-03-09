<script lang="ts">
	const items = [
		{
			href: '/site-layout',
			label: 'SiteLayout',
			group: 'Layouts',
			description: '3-column layout with sticky sidebars for search, explorer, ToC, graph, and backlinks.'
		},
		{
			href: '/pages/tag-list',
			label: 'TagListPage',
			group: 'Pages',
			description: 'Lists all tags in the vault with note counts and links.'
		},
		{
			href: '/pages/tag/demo',
			label: 'TagPage',
			group: 'Pages',
			description: 'Filters and lists all notes belonging to a specific tag.'
		},
		{
			href: '/pages/folder-list',
			label: 'FolderListPage',
			group: 'Pages',
			description: 'Lists all folder buckets with note counts and links.'
		},
		{
			href: '/pages/folder/docs',
			label: 'FolderPage',
			group: 'Pages',
			description: 'Lists notes inside a specific folder by slug prefix.'
		},
		{
			href: '/pages/feed',
			label: 'FeedPage',
			group: 'Pages',
			description: 'Chronological archive of all notes (newest first) at /feed. Customisable via feed/index.md.'
		},
		{
			href: '/pages/not-found',
			label: 'NotFoundPage',
			group: 'Pages',
			description: '404 page with the missing pathname and a link back home.'
		}
	];

	const layouts = items.filter((i) => i.group === 'Layouts');
	const pages = items.filter((i) => i.group === 'Pages');
</script>

<div class="mx-auto max-w-4xl px-8 py-12">
	<div class="mb-10">
		<h1 class="text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
			@svartz/theme-minimal
		</h1>
		<p class="mt-2 text-base text-zinc-600 dark:text-zinc-400">
		A clean, three-column note-browsing theme. Provides one layout component and six page
		components that integrate all <code class="font-mono text-sm">@svartz/ui</code> primitives.
		</p>
	</div>

	<!-- Layouts -->
	<div class="mb-10">
		<h2 class="mb-4 text-lg font-semibold text-zinc-900 dark:text-zinc-100">Layouts</h2>
		<div class="grid gap-4">
			{#each layouts as { href, label, description }}
				<a
					{href}
					class="group flex items-start justify-between gap-4 rounded-lg border border-zinc-200 p-5 transition-all hover:border-zinc-300 hover:shadow-sm dark:border-zinc-800 dark:hover:border-zinc-700"
				>
					<div class="grid gap-1.5">
						<span
							class="font-mono text-sm font-semibold text-zinc-900 group-hover:text-blue-600 dark:text-zinc-100 dark:group-hover:text-blue-400"
						>
							{label}
						</span>
						<p class="text-sm text-zinc-500 dark:text-zinc-400">{description}</p>
					</div>
					<svg
						class="mt-0.5 size-4 shrink-0 text-zinc-400 transition-transform group-hover:translate-x-0.5 dark:text-zinc-500"
						xmlns="http://www.w3.org/2000/svg"
						viewBox="0 0 20 20"
						fill="currentColor"
						aria-hidden="true"
					>
						<path
							fill-rule="evenodd"
							d="M3 10a.75.75 0 0 1 .75-.75h10.638L10.23 5.29a.75.75 0 1 1 1.04-1.08l5.5 5.25a.75.75 0 0 1 0 1.08l-5.5 5.25a.75.75 0 1 1-1.04-1.08l4.158-3.96H3.75A.75.75 0 0 1 3 10Z"
							clip-rule="evenodd"
						/>
					</svg>
				</a>
			{/each}
		</div>
	</div>

	<!-- Pages -->
	<div>
		<h2 class="mb-4 text-lg font-semibold text-zinc-900 dark:text-zinc-100">Pages</h2>
		<div class="grid gap-4 sm:grid-cols-2">
			{#each pages as { href, label, description }}
				<a
					{href}
					class="group flex flex-col gap-2 rounded-lg border border-zinc-200 p-5 transition-all hover:border-zinc-300 hover:shadow-sm dark:border-zinc-800 dark:hover:border-zinc-700"
				>
					<div class="flex items-center justify-between">
						<span
							class="font-mono text-sm font-semibold text-zinc-900 group-hover:text-blue-600 dark:text-zinc-100 dark:group-hover:text-blue-400"
						>
							{label}
						</span>
						<svg
							class="size-4 text-zinc-400 transition-transform group-hover:translate-x-0.5 dark:text-zinc-500"
							xmlns="http://www.w3.org/2000/svg"
							viewBox="0 0 20 20"
							fill="currentColor"
							aria-hidden="true"
						>
							<path
								fill-rule="evenodd"
								d="M3 10a.75.75 0 0 1 .75-.75h10.638L10.23 5.29a.75.75 0 1 1 1.04-1.08l5.5 5.25a.75.75 0 0 1 0 1.08l-5.5 5.25a.75.75 0 1 1-1.04-1.08l4.158-3.96H3.75A.75.75 0 0 1 3 10Z"
								clip-rule="evenodd"
							/>
						</svg>
					</div>
					<p class="text-sm text-zinc-500 dark:text-zinc-400">{description}</p>
				</a>
			{/each}
		</div>
	</div>
</div>
