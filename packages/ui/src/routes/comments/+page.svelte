<script lang="ts">
	const props = [
		{ name: 'repo', type: 'string', description: 'GitHub repository in "owner/repo" format.' },
		{ name: 'repoId', type: 'string', description: 'Repository node ID from the Giscus setup wizard.' },
		{ name: 'category', type: 'string', description: 'Discussion category name (e.g. "Announcements").' },
		{ name: 'categoryId', type: 'string', description: 'Category node ID from the Giscus setup wizard.' },
		{ name: 'mapping', type: "'url' | 'title' | 'pathname' | …", description: 'How to map pages to discussions. Default: "pathname".' },
		{ name: 'strict', type: 'boolean', description: 'Strict title matching for the mapping. Default: false.' },
		{ name: 'reactionsEnabled', type: 'boolean', description: 'Show emoji reactions on the post. Default: true.' },
		{ name: 'inputPosition', type: "'top' | 'bottom'", description: 'Where the comment box appears. Default: "bottom".' },
		{ name: 'lang', type: 'string', description: 'Giscus UI language code. Default: "en".' },
		{ name: 'lightTheme', type: 'string', description: 'Giscus theme for light mode. Default: "light".' },
		{ name: 'darkTheme', type: 'string', description: 'Giscus theme for dark mode. Default: "dark".' },
		{ name: 'enabled', type: 'boolean', description: 'Set to false to hide comments (e.g. from frontmatter). Default: true.' }
	];
</script>

<div class="mx-auto max-w-3xl px-8 py-12">
	<div class="mb-1">
		<a href="/" class="text-xs text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200">Components</a>
		<span class="mx-1 text-zinc-300 dark:text-zinc-600">/</span>
	</div>
	<h1 class="text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">Comments</h1>
	<p class="mt-3 text-base text-zinc-600 dark:text-zinc-400">
		Embeds a <a href="https://giscus.app" target="_blank" rel="noopener" class="underline underline-offset-2 hover:text-zinc-900 dark:hover:text-zinc-100">Giscus</a>
		comment thread backed by GitHub Discussions. Theme stays in sync with Tailwind's dark mode automatically.
		Use <code class="rounded bg-zinc-100 px-1 py-0.5 font-mono text-sm dark:bg-zinc-800">enabled={'{'}false{'}'}</code>
		to suppress comments per-note via frontmatter.
	</p>

	<!-- Setup callout -->
	<div class="mt-8 rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950/30">
		<p class="text-sm font-medium text-amber-800 dark:text-amber-300">Live preview not shown</p>
		<p class="mt-1 text-sm text-amber-700 dark:text-amber-400">
			Comments requires a configured Giscus repository. Visit
			<a href="https://giscus.app" target="_blank" rel="noopener" class="underline underline-offset-2">giscus.app</a>
			to generate your <code class="font-mono text-xs">repo</code>, <code class="font-mono text-xs">repoId</code>,
			<code class="font-mono text-xs">category</code>, and <code class="font-mono text-xs">categoryId</code> values.
		</p>
	</div>

	<!-- Usage snippet -->
	<div class="mt-8">
		<p class="mb-3 text-sm font-medium text-zinc-700 dark:text-zinc-300">Usage</p>
		<div class="overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-700">
			<pre class="overflow-x-auto bg-zinc-950 p-5 text-sm leading-relaxed text-zinc-100"><code
>&lt;script&gt;
  import {'{'} Comments {'}'} from '@svartz/ui';
&lt;/script&gt;

&lt;Comments
  repo="owner/repo"
  repoId="R_kgDO..."
  category="Announcements"
  categoryId="DIC_kwDO..."
  lightTheme="light"
  darkTheme="dark_dimmed"
/&gt;</code></pre>
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
