<script lang="ts">
	const props = [
		{ name: 'children', type: 'Snippet', description: 'The main note content rendered in the center column.' },
		{ name: 'entry', type: 'Entry?', description: 'Note metadata: title, description, dates, tags, toc, wordCount.' },
		{ name: 'index', type: 'Index?', description: 'Full vault index with entries, backlinks map, and graph adjacency map.' },
		{ name: 'backlinks', type: 'Record<string, string[]>?', description: 'Passed separately for convenience (also part of index).' },
		{ name: 'graph', type: 'Record<string, string[]>?', description: 'Adjacency map for the graph panel.' },
		{ name: 'match', type: 'RouteMatch?', description: 'Current route match — provides pathname and params.slug used for breadcrumbs.' },
		{ name: 'searchDocuments', type: 'SearchDocument[]?', description: 'Documents passed to SearchBox for client-side search.' },
		{ name: 'searchIndex', type: 'unknown?', description: 'Pre-built MiniSearch index for faster search startup.' }
	];
</script>

<div class="mx-auto max-w-3xl px-8 py-12">
	<div class="mb-1">
		<a href="/" class="text-xs text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200">Overview</a>
		<span class="mx-1 text-zinc-300 dark:text-zinc-600">/</span>
		<span class="text-xs text-zinc-500">Layouts</span>
		<span class="mx-1 text-zinc-300 dark:text-zinc-600">/</span>
	</div>
	<h1 class="text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">SiteLayout</h1>
	<p class="mt-3 text-base text-zinc-600 dark:text-zinc-400">
		The primary three-column layout for the minimal theme. Left sidebar contains <code
			class="font-mono text-sm">SearchBox</code
		>
		and
		<code class="font-mono text-sm">FileTrie</code>; center column has
		<code class="font-mono text-sm">Breadcrumbs</code>,
		<code class="font-mono text-sm">NoteHeader</code>, and note content; right sidebar has
		<code class="font-mono text-sm">TableOfContents</code>,
		<code class="font-mono text-sm">GraphPanel</code>, and
		<code class="font-mono text-sm">Backlinks</code>. Collapses to two columns at 82rem and single
		column at 62rem.
	</p>

	<!-- Full demo links -->
	<div class="mt-8 flex flex-wrap gap-3">
		<a
			href="/layout"
			target="_blank"
			rel="noopener"
			class="inline-flex items-center gap-2 rounded-md border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-700 shadow-sm transition-colors hover:border-zinc-300 hover:text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:border-zinc-600 dark:hover:text-zinc-100"
		>
			<svg
				class="size-4"
				xmlns="http://www.w3.org/2000/svg"
				viewBox="0 0 20 20"
				fill="currentColor"
				aria-hidden="true"
			>
				<path
					d="M12.232 4.232a2.5 2.5 0 0 1 3.536 3.536l-1.225 1.224a.75.75 0 0 0 1.061 1.06l1.224-1.224a4 4 0 0 0-5.656-5.656l-3 3a4 4 0 0 0 .225 5.865.75.75 0 0 0 .977-1.138 2.5 2.5 0 0 1-.142-3.667l3-3Z"
				/>
				<path
					d="M11.603 7.963a.75.75 0 0 0-.977 1.138 2.5 2.5 0 0 1 .142 3.667l-3 3a2.5 2.5 0 0 1-3.536-3.536l1.225-1.224a.75.75 0 0 0-1.061-1.06l-1.224 1.224a4 4 0 1 0 5.656 5.656l3-3a4 4 0 0 0-.225-5.865Z"
				/>
			</svg>
			Open shell-only demo
		</a>
		<a
			href="/note"
			target="_blank"
			rel="noopener"
			class="inline-flex items-center gap-2 rounded-md border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-700 shadow-sm transition-colors hover:border-zinc-300 hover:text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:border-zinc-600 dark:hover:text-zinc-100"
		>
			<svg
				class="size-4"
				xmlns="http://www.w3.org/2000/svg"
				viewBox="0 0 20 20"
				fill="currentColor"
				aria-hidden="true"
			>
				<path
					d="M12.232 4.232a2.5 2.5 0 0 1 3.536 3.536l-1.225 1.224a.75.75 0 0 0 1.061 1.06l1.224-1.224a4 4 0 0 0-5.656-5.656l-3 3a4 4 0 0 0 .225 5.865.75.75 0 0 0 .977-1.138 2.5 2.5 0 0 1-.142-3.667l3-3Z"
				/>
				<path
					d="M11.603 7.963a.75.75 0 0 0-.977 1.138 2.5 2.5 0 0 1 .142 3.667l-3 3a2.5 2.5 0 0 1-3.536-3.536l1.225-1.224a.75.75 0 0 0-1.061-1.06l-1.224 1.224a4 4 0 1 0 5.656 5.656l3-3a4 4 0 0 0-.225-5.865Z"
				/>
			</svg>
			Open full note demo (all components)
		</a>
	</div>

	<!-- Layout diagram -->
	<div class="mt-8">
		<p class="mb-3 text-sm font-medium text-zinc-700 dark:text-zinc-300">Layout structure</p>
		<div
			class="grid grid-cols-[1fr_2fr_1fr] gap-2 rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-700 dark:bg-zinc-900/50"
		>
			<div
				class="flex flex-col gap-2 rounded border border-zinc-200 bg-white p-3 dark:border-zinc-700 dark:bg-zinc-900"
			>
				<span class="text-xs font-medium text-zinc-500 dark:text-zinc-400">Left sidebar</span>
				<code class="text-xs text-blue-600 dark:text-blue-400">SearchBox</code>
				<code class="text-xs text-blue-600 dark:text-blue-400">FileTrie</code>
			</div>
			<div
				class="flex flex-col gap-2 rounded border border-zinc-200 bg-white p-3 dark:border-zinc-700 dark:bg-zinc-900"
			>
				<span class="text-xs font-medium text-zinc-500 dark:text-zinc-400">Content</span>
				<code class="text-xs text-blue-600 dark:text-blue-400">Breadcrumbs</code>
				<code class="text-xs text-blue-600 dark:text-blue-400">NoteHeader</code>
				<span class="text-xs italic text-zinc-400">children</span>
			</div>
			<div
				class="flex flex-col gap-2 rounded border border-zinc-200 bg-white p-3 dark:border-zinc-700 dark:bg-zinc-900"
			>
				<span class="text-xs font-medium text-zinc-500 dark:text-zinc-400">Right sidebar</span>
				<code class="text-xs text-blue-600 dark:text-blue-400">TableOfContents</code>
				<code class="text-xs text-blue-600 dark:text-blue-400">GraphPanel</code>
				<code class="text-xs text-blue-600 dark:text-blue-400">Backlinks</code>
			</div>
		</div>
	</div>

	<!-- Props -->
	<div class="mt-10">
		<h2 class="mb-4 text-lg font-semibold text-zinc-900 dark:text-zinc-100">Props</h2>
		<div class="overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-700">
			<table class="w-full text-sm">
				<thead class="border-b border-zinc-200 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900">
					<tr>
						<th class="px-4 py-3 text-left font-medium text-zinc-700 dark:text-zinc-300">Prop</th>
						<th class="px-4 py-3 text-left font-medium text-zinc-700 dark:text-zinc-300">Type</th>
						<th class="px-4 py-3 text-left font-medium text-zinc-700 dark:text-zinc-300">Description</th>
					</tr>
				</thead>
				<tbody class="divide-y divide-zinc-100 dark:divide-zinc-800">
					{#each props as prop}
						<tr class="bg-white dark:bg-zinc-950">
							<td class="px-4 py-3 font-mono text-xs text-blue-600 dark:text-blue-400">{prop.name}</td>
							<td class="px-4 py-3 font-mono text-xs text-zinc-500 dark:text-zinc-400">{prop.type}</td>
							<td class="px-4 py-3 text-zinc-600 dark:text-zinc-400">{prop.description}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	</div>
</div>
