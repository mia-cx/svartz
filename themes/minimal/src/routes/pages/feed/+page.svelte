<script lang="ts">
	import FeedPage from '$lib/pages/FeedPage.svelte';

	const mockEntries = [
		{
			slug: 'building-a-knowledge-base',
			title: 'Building a Knowledge Base',
			description: 'How to structure your notes for long-term recall and discovery.',
			tags: ['productivity', 'notes'],
			modifiedAt: new Date('2026-03-08'),
			readingTimeMinutes: 6
		},
		{
			slug: 'svelte-5-runes',
			title: 'Svelte 5 Runes Deep Dive',
			description: 'Everything you need to know about $state, $derived, and $effect.',
			tags: ['svelte', 'javascript'],
			modifiedAt: new Date('2026-03-05'),
			readingTimeMinutes: 9
		},
		{
			slug: 'zettelkasten-method',
			title: 'The Zettelkasten Method',
			description: 'Atomic notes and the slip-box approach to connected thinking.',
			tags: ['productivity'],
			modifiedAt: new Date('2026-02-28'),
			readingTimeMinutes: 5
		},
		{
			slug: 'graph-databases',
			title: 'Graph Databases & Knowledge Graphs',
			description: 'Using graph-native storage to represent interconnected ideas.',
			tags: ['databases'],
			modifiedAt: new Date('2026-02-20'),
			readingTimeMinutes: 7
		},
		{
			slug: 'tailwind-v4',
			title: 'Tailwind v4 Migration Notes',
			tags: ['css', 'tailwind'],
			modifiedAt: new Date('2026-02-15'),
			readingTimeMinutes: 3
		}
	];

	const props = [
		{
			name: 'index',
			type: '{ entries: Entry[] }',
			description:
				'Full vault index. Notes are sorted by modifiedAt → createdAt descending. If a note with slug "feed" or "feed/index" exists, its title and description are used as the page header and the note is excluded from the list.'
		}
	];
</script>

<div class="mx-auto max-w-3xl px-8 py-12">
	<div class="mb-1">
		<a href="/" class="text-xs text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200">Overview</a>
		<span class="mx-1 text-zinc-300 dark:text-zinc-600">/</span>
		<span class="text-xs text-zinc-500">Pages</span>
		<span class="mx-1 text-zinc-300 dark:text-zinc-600">/</span>
	</div>
	<h1 class="text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">FeedPage</h1>
	<p class="mt-3 text-base text-zinc-600 dark:text-zinc-400">
		Renders the <code class="rounded bg-zinc-100 px-1 py-0.5 font-mono text-sm dark:bg-zinc-800">/feed</code>
		archive — all notes sorted newest first, with reading time and tags. Add a
		<code class="rounded bg-zinc-100 px-1 py-0.5 font-mono text-sm dark:bg-zinc-800">feed.md</code>
		or
		<code class="rounded bg-zinc-100 px-1 py-0.5 font-mono text-sm dark:bg-zinc-800">feed/index.md</code>
		to your vault to supply a custom title and description for the page header.
	</p>

	<!-- Preview -->
	<div class="mt-8">
		<p class="mb-3 text-sm font-medium text-zinc-700 dark:text-zinc-300">Preview</p>
		<div class="rounded-lg border border-zinc-200 bg-zinc-50 p-6 dark:border-zinc-700 dark:bg-zinc-900/50">
			<FeedPage index={{ entries: mockEntries }} />
		</div>
	</div>

	<!-- feed/index.md context -->
	<div class="mt-8 rounded-lg border border-zinc-200 bg-zinc-50 p-5 dark:border-zinc-700 dark:bg-zinc-900/50">
		<p class="text-sm font-medium text-zinc-800 dark:text-zinc-200">Vault context via <code class="font-mono text-xs">feed/index.md</code></p>
		<p class="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
			If your vault contains a note at <code class="font-mono text-xs">feed.md</code> or
			<code class="font-mono text-xs">feed/index.md</code>, FeedPage will use its
			<code class="font-mono text-xs">title</code> frontmatter as the page heading and its
			<code class="font-mono text-xs">description</code> as the subtitle. The note is excluded
			from the feed list itself.
		</p>
		<pre class="mt-3 overflow-x-auto rounded border border-zinc-200 bg-zinc-950 p-3 text-xs text-zinc-100 dark:border-zinc-700"><code>---
title: Writing Log
description: Everything I've published, newest first.
tags: [meta]
---</code></pre>
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
