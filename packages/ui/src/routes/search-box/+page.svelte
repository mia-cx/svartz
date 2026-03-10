<script lang="ts">
	import SearchBox from '$lib/SearchBox.svelte';

	const searchDocuments = [
		{
			id: '1',
			slug: 'index',
			title: 'Home',
			description: 'Welcome to the Svartz documentation.',
			content: 'Svartz is a framework for building digital gardens and knowledge bases. Get started by installing the CLI and creating your first vault.',
			tags: ['svartz', 'overview']
		},
		{
			id: '2',
			slug: 'getting-started',
			title: 'Getting Started',
			description: 'Install and configure Svartz in minutes.',
			content: 'Install Svartz with pnpm, npm, or yarn. Run the CLI to scaffold a new project. Choose a theme and start writing notes in Markdown.',
			tags: ['install', 'setup', 'quickstart']
		},
		{
			id: '3',
			slug: 'api',
			title: 'API Reference',
			description: 'Complete API documentation for all Svartz packages.',
			content: 'Full API reference for @svartz/core, @svartz/ui, and @svartz/cli. Includes function signatures, type definitions, and usage examples.',
			tags: ['api', 'reference', 'typescript']
		},
		{
			id: '4',
			slug: 'guides/setup',
			title: 'Setup Guide',
			description: 'Step-by-step vault configuration guide.',
			content: 'Configure your vault directory, set up the content pipeline, and customize the build output. Includes environment variable reference.',
			tags: ['guide', 'configuration', 'vault']
		},
		{
			id: '5',
			slug: 'guides/themes',
			title: 'Theming',
			description: 'Customize the look and feel of your digital garden.',
			content: 'Create a custom theme or extend the minimal theme. Use Tailwind CSS classes to style components. Override layout templates.',
			tags: ['themes', 'css', 'tailwind', 'design']
		},
		{
			id: '6',
			slug: 'components/search',
			title: 'SearchBox Component',
			description: 'MiniSearch-powered modal search with keyboard shortcuts.',
			content: 'The SearchBox component provides a modal search interface. Open with Cmd+K or Ctrl+K. Navigate results with arrow keys. Supports fuzzy and prefix matching.',
			tags: ['component', 'search', 'keyboard']
		},
		{
			id: '7',
			slug: 'components/graph',
			title: 'GraphPanel Component',
			description: 'D3 force-directed graph of note connections.',
			content: 'Visualise the relationship graph for the current note. Nodes are sized by connection degree. Drag nodes to reposition them. Click to navigate.',
			tags: ['component', 'graph', 'd3', 'visualization']
		}
	];

	const props = [
		{ name: 'searchDocuments', type: 'SearchDocument[]', description: 'Documents to search. When no searchIndex is provided the component builds a live MiniSearch index from these.' },
		{ name: 'searchIndex', type: 'unknown?', description: 'Pre-serialized MiniSearch index (JSON). When provided, loaded directly for fast cold-start — recommended for large vaults.' }
	];
</script>

<div class="mx-auto max-w-3xl px-8 py-12">
	<div class="mb-1">
		<a href="/" class="text-xs text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200">Components</a>
		<span class="mx-1 text-zinc-300 dark:text-zinc-600">/</span>
	</div>
	<h1 class="text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">SearchBox</h1>
	<p class="mt-3 text-base text-zinc-600 dark:text-zinc-400">
		A MiniSearch-powered search component. The sidebar shows a styled trigger that looks like an
		input field. Clicking it — or pressing <kbd class="rounded border border-zinc-200 bg-zinc-100 px-1 py-0.5 font-mono text-xs dark:border-zinc-700 dark:bg-zinc-800">⌘K</kbd>
		— opens a modal with a real input and keyboard-navigable results.
	</p>

	<!-- Preview -->
	<div class="mt-8">
		<p class="mb-3 text-sm font-medium text-zinc-700 dark:text-zinc-300">Preview</p>
		<div
			class="rounded-lg border border-zinc-200 bg-zinc-50 p-6 dark:border-zinc-700 dark:bg-zinc-900/50"
		>
			<div class="max-w-xs">
				<SearchBox {searchDocuments} />
			</div>
			<p class="mt-4 text-xs text-zinc-400 dark:text-zinc-500">
				Try searching for "install", "graph", "theme", or "keyboard".
			</p>
		</div>
	</div>

	<!-- Keyboard shortcuts -->
	<div class="mt-8">
		<h2 class="mb-3 text-lg font-semibold text-zinc-900 dark:text-zinc-100">Keyboard shortcuts</h2>
		<div class="overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-700">
			<table class="w-full text-sm">
				<thead class="border-b border-zinc-200 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900">
					<tr>
						<th class="px-4 py-3 text-left font-medium text-zinc-700 dark:text-zinc-300">Key</th>
						<th class="px-4 py-3 text-left font-medium text-zinc-700 dark:text-zinc-300">Action</th>
					</tr>
				</thead>
				<tbody class="divide-y divide-zinc-100 dark:divide-zinc-800">
					{#each [
						{ key: '⌘K / Ctrl+K', action: 'Open the search modal from anywhere on the page' },
						{ key: 'Esc', action: 'Close the modal' },
						{ key: '↑ / ↓', action: 'Navigate through results' },
						{ key: 'Enter', action: 'Navigate to the highlighted result' }
					] as row (row.key)}
						<tr class="bg-white dark:bg-zinc-950">
							<td class="px-4 py-3 font-mono text-xs text-zinc-700 dark:text-zinc-300">{row.key}</td>
							<td class="px-4 py-3 text-zinc-600 dark:text-zinc-400">{row.action}</td>
						</tr>
					{/each}
				</tbody>
			</table>
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
