<script lang="ts">
	import TagListPage from '$lib/pages/TagListPage.svelte';

	const tags = [
		{ slug: 'demo', title: 'demo', noteCount: 3, href: '/tags/demo/' },
		{ slug: 'theme', title: 'theme', noteCount: 2, href: '/tags/theme/' },
		{ slug: 'svartz', title: 'svartz', noteCount: 5, href: '/tags/svartz/' },
		{ slug: 'tutorial', title: 'tutorial', noteCount: 1, href: '/tags/tutorial/' }
	];

	const props = [
		{ name: 'tags', type: 'TagEntry[]', description: 'All tags with their slug, display title, note count, and href.' }
	];
</script>

<div class="mx-auto max-w-3xl px-8 py-12">
	<div class="mb-1">
		<a href="/" class="text-xs text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200">Overview</a>
		<span class="mx-1 text-zinc-300 dark:text-zinc-600">/</span>
		<span class="text-xs text-zinc-500">Pages</span>
		<span class="mx-1 text-zinc-300 dark:text-zinc-600">/</span>
	</div>
	<h1 class="text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">TagListPage</h1>
	<p class="mt-3 text-base text-zinc-600 dark:text-zinc-400">
		Renders the <code class="font-mono text-sm">/tags</code> index page — a full list of every tag
		in the vault with note counts and links to each tag's dedicated page.
	</p>

	<!-- Preview -->
	<div class="mt-8">
		<p class="mb-3 text-sm font-medium text-zinc-700 dark:text-zinc-300">Preview</p>
		<div
			class="rounded-lg border border-zinc-200 bg-zinc-50 p-6 dark:border-zinc-700 dark:bg-zinc-900/50"
		>
			<div class="max-w-sm">
				<TagListPage {tags} />
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
