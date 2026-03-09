<script lang="ts">
	import RecentNotes from '$lib/RecentNotes.svelte';

	const entries = [
		{
			slug: 'building-a-knowledge-base',
			title: 'Building a Knowledge Base',
			description: 'How to structure your notes for long-term recall.',
			modifiedAt: new Date('2026-03-08'),
			tags: ['productivity', 'notes']
		},
		{
			slug: 'svelte-5-runes',
			title: 'Svelte 5 Runes Deep Dive',
			description: 'Everything you need to know about $state, $derived, and $effect.',
			modifiedAt: new Date('2026-03-05'),
			tags: ['svelte', 'javascript']
		},
		{
			slug: 'zettelkasten-method',
			title: 'The Zettelkasten Method',
			description: 'Atomic notes and the slip-box approach.',
			modifiedAt: new Date('2026-02-28'),
			tags: ['productivity']
		},
		{
			slug: 'graph-databases',
			title: 'Graph Databases & Knowledge Graphs',
			modifiedAt: new Date('2026-02-20'),
			tags: ['databases']
		},
		{
			slug: 'tailwind-v4',
			title: 'Tailwind v4 Migration Notes',
			modifiedAt: new Date('2026-02-15'),
			tags: ['css', 'tailwind']
		}
	];

	const props = [
		{ name: 'entries', type: 'Entry[]', description: 'Notes to display, sorted by modifiedAt → createdAt descending.' },
		{ name: 'limit', type: 'number', description: 'Maximum number of notes to show. Default: 3.' },
		{ name: 'title', type: 'string', description: 'Section heading. Default: "Recent Notes".' },
		{ name: 'showTags', type: 'boolean', description: 'Whether to show tag pills below each note. Default: true.' },
		{ name: 'linkToMore', type: 'string | undefined', description: 'URL for a "See N more →" link when there are more notes than the limit.' }
	];
</script>

<div class="mx-auto max-w-3xl px-8 py-12">
	<div class="mb-1">
		<a href="/" class="text-xs text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200">Components</a>
		<span class="mx-1 text-zinc-300 dark:text-zinc-600">/</span>
	</div>
	<h1 class="text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">RecentNotes</h1>
	<p class="mt-3 text-base text-zinc-600 dark:text-zinc-400">
		Shows a list of the most recently modified notes. Sorts by <code class="rounded bg-zinc-100 px-1 py-0.5 font-mono text-sm dark:bg-zinc-800">modifiedAt</code>
		(falling back to <code class="rounded bg-zinc-100 px-1 py-0.5 font-mono text-sm dark:bg-zinc-800">createdAt</code>)
		and optionally surfaces tag pills. Useful in sidebars or on landing pages.
	</p>

	<!-- Preview -->
	<div class="mt-8">
		<p class="mb-3 text-sm font-medium text-zinc-700 dark:text-zinc-300">Preview</p>
		<div class="rounded-lg border border-zinc-200 bg-zinc-50 p-6 dark:border-zinc-700 dark:bg-zinc-900/50">
			<div class="max-w-xs">
				<RecentNotes {entries} limit={3} linkToMore="/archive/" />
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
