<script lang="ts">
	import { buildBreadcrumbs } from './navigation';

	let { slug }: { slug?: string } = $props();
	const items = $derived(buildBreadcrumbs(slug));
</script>

<nav aria-label="Breadcrumbs">
	<ol class="flex flex-wrap items-center gap-1 text-xs text-zinc-500 dark:text-zinc-400">
		{#each items as item, index (item.href)}
			{@const isLast = index === items.length - 1}
			<li class="flex items-center gap-1">
				{#if isLast}
					<span aria-current="page" class="font-medium text-zinc-900 dark:text-zinc-100">
						{item.title}
					</span>
				{:else}
					<a
						href={item.href}
						class="transition-colors hover:text-zinc-900 dark:hover:text-zinc-100"
					>
						{item.title}
					</a>
					<span aria-hidden="true" class="text-zinc-300 dark:text-zinc-600">/</span>
				{/if}
			</li>
		{/each}
	</ol>
</nav>
