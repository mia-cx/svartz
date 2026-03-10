<script lang="ts">
	import NoteHeader from '$lib/NoteHeader.svelte';

	const entry = {
		title: 'Getting Started with Svartz',
		description: 'Learn how to build a digital garden with the Svartz framework, from installation to your first published note.',
		createdAt: new Date('2025-01-10'),
		modifiedAt: new Date('2025-03-07'),
		tags: ['svartz', 'tutorial', 'getting-started'],
		wordCount: 1420
	};

	const props = [
		{ name: 'entry.title', type: 'string', description: 'The note title. Rendered as an <h1>.' },
		{ name: 'entry.description', type: 'string?', description: 'Short description shown below the metadata line.' },
		{ name: 'entry.createdAt', type: 'Date?', description: 'Creation date — displayed in the meta row.' },
		{ name: 'entry.modifiedAt', type: 'Date?', description: 'Last-modified date — displayed in the meta row.' },
		{ name: 'entry.tags', type: 'string[]?', description: 'Tag list. Each tag links to /tags/{tag}/.' },
		{ name: 'entry.wordCount', type: 'number?', description: 'Word count. Shown as "X min read" (ceil(n / 200)).' }
	];
</script>

<div class="mx-auto max-w-3xl px-8 py-12">
	<div class="mb-1">
		<a href="/" class="text-xs text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200">Components</a>
		<span class="mx-1 text-zinc-300 dark:text-zinc-600">/</span>
	</div>
	<h1 class="text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">NoteHeader</h1>
	<p class="mt-3 text-base text-zinc-600 dark:text-zinc-400">
		The hero header for a note page. Shows the title, creation and modification dates, an optional
		reading-time estimate, a description, and tag pills that link to their tag index page.
	</p>

	<!-- Preview -->
	<div class="mt-8">
		<p class="mb-3 text-sm font-medium text-zinc-700 dark:text-zinc-300">Preview</p>
		<div
			class="rounded-lg border border-zinc-200 bg-zinc-50 p-6 dark:border-zinc-700 dark:bg-zinc-900/50"
		>
			<NoteHeader {entry} />
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
					{#each props as prop (prop.name)}
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
