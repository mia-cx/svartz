<script lang="ts">
	import FileTrie from '$lib/FileTrie.svelte';

	const entries = [
		{ slug: 'index', path: 'index', title: 'Home' },
		{ slug: 'getting-started', path: 'getting-started', title: 'Getting Started' },
		{ slug: 'docs/overview', path: 'docs/overview', title: 'Overview' },
		{ slug: 'docs/installation', path: 'docs/installation', title: 'Installation' },
		{ slug: 'docs/guides/quickstart', path: 'docs/guides/quickstart', title: 'Quickstart' },
		{ slug: 'docs/guides/configuration', path: 'docs/guides/configuration', title: 'Configuration' },
		{ slug: 'api/reference', path: 'api/reference', title: 'API Reference' }
	];

	const props = [
		{ name: 'entries', type: 'UiIndexEntry[]', description: 'Flat list of all notes. The tree structure is derived from the slug segments.' }
	];
</script>

<div class="mx-auto max-w-3xl px-8 py-12">
	<div class="mb-1">
		<a href="/" class="text-xs text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200">Components</a>
		<span class="mx-1 text-zinc-300 dark:text-zinc-600">/</span>
	</div>
	<h1 class="text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">FileTrie</h1>
	<p class="mt-3 text-base text-zinc-600 dark:text-zinc-400">
		A recursive file-tree explorer built from a flat list of entry slugs. Folders are collapsed by
		default and toggled with a chevron button. Click any note to navigate.
	</p>

	<!-- Preview -->
	<div class="mt-8">
		<p class="mb-3 text-sm font-medium text-zinc-700 dark:text-zinc-300">Preview</p>
		<div
			class="rounded-lg border border-zinc-200 bg-zinc-50 p-6 dark:border-zinc-700 dark:bg-zinc-900/50"
		>
			<div class="max-w-xs">
				<FileTrie {entries} />
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

	<div class="mt-6 rounded-lg border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-700 dark:border-blue-900/50 dark:bg-blue-950/30 dark:text-blue-300">
		<strong>Note:</strong> Folder collapse state is internal. Per-folder default-open overrides will be available in a future release via a <code class="font-mono text-xs">defaultOpen</code> prop.
	</div>
</div>
