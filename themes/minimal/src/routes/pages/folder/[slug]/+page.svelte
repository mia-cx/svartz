<script lang="ts">
	import { page } from '$app/state';
	import FolderPage from '$lib/pages/FolderPage.svelte';

	const slug = $derived(page.params.slug ?? 'docs');

	const index = {
		entries: [
			{ slug: 'docs', title: 'Docs index', description: 'Overview of the docs section.' },
			{ slug: 'docs/getting-started', title: 'Getting Started', description: 'Setup guide.' },
			{ slug: 'docs/api', title: 'API Reference', description: 'Full API documentation.' },
			{ slug: 'docs/guides/quickstart', title: 'Quickstart', description: 'Your first note in 5 minutes.' }
		]
	};

	const props = [
		{ name: 'match', type: '{ params: { slug: string } }?', description: 'Route match — params.slug is the folder path to show (e.g. "docs").' },
		{ name: 'index', type: '{ entries: Entry[] }?', description: 'Full vault index. Entries are filtered by slug prefix matching the folder.' }
	];
</script>

<div class="mx-auto max-w-3xl px-8 py-12">
	<div class="mb-1">
		<a href="/" class="text-xs text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200">Overview</a>
		<span class="mx-1 text-zinc-300 dark:text-zinc-600">/</span>
		<span class="text-xs text-zinc-500">Pages</span>
		<span class="mx-1 text-zinc-300 dark:text-zinc-600">/</span>
	</div>
	<h1 class="text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">FolderPage</h1>
	<p class="mt-3 text-base text-zinc-600 dark:text-zinc-400">
		Renders the <code class="font-mono text-sm">/folders/[slug]</code> page — filters all vault
		entries whose slug starts with the given folder path and displays them as a list.
	</p>

	<!-- Preview -->
	<div class="mt-8">
		<p class="mb-3 text-sm font-medium text-zinc-700 dark:text-zinc-300">
			Preview — folder: <code class="font-mono text-xs">{slug}</code>
		</p>
		<div
			class="rounded-lg border border-zinc-200 bg-zinc-50 p-6 dark:border-zinc-700 dark:bg-zinc-900/50"
		>
			<div class="max-w-sm">
				<FolderPage match={{ params: { slug } }} {index} />
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
