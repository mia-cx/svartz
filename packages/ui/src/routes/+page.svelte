<script lang="ts">
	const components = [
		{
			href: '/backlinks',
			label: 'Backlinks',
			description: 'Lists notes that link to the current note, building a reverse-link graph.'
		},
		{
			href: '/breadcrumbs',
			label: 'Breadcrumbs',
			description: 'Derives a breadcrumb trail from a slug path for wayfinding.'
		},
		{
			href: '/comments',
			label: 'Comments',
			description: 'Giscus embed (GitHub Discussions) with automatic dark mode sync.'
		},
		{
			href: '/explorer',
			label: 'FileTrie',
			description: 'Renders a collapsible file-tree explorer from a flat list of entries.'
		},
		{
			href: '/graph-panel',
			label: 'GraphPanel',
			description: 'D3 force-directed graph showing the current note and its connections.'
		},
		{
			href: '/note-header',
			label: 'NoteHeader',
			description: 'Header with title, dates, reading time, description, and tag pills.'
		},
		{
			href: '/recent-notes',
			label: 'RecentNotes',
			description: 'Most recently modified notes with dates and tags, sorted automatically.'
		},
		{
			href: '/search-box',
			label: 'SearchBox',
			description: 'MiniSearch-powered modal search triggered by a sidebar input or ⌘K.'
		},
		{
			href: '/table-of-contents',
			label: 'TableOfContents',
			description: 'Collapsible in-page navigation built from heading depth and anchor slugs.'
		}
	];
</script>

<div class="mx-auto max-w-4xl px-8 py-12">
	<div class="mb-10">
		<h1 class="text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">Components</h1>
		<p class="mt-2 text-base text-zinc-600 dark:text-zinc-400">
			UI primitives for Svartz-powered sites. Each component accepts typed props and renders
			unstyled semantic HTML styled with Tailwind.
		</p>
	</div>

	<div class="grid gap-4 sm:grid-cols-2">
		{#each components as { href, label, description }}
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
