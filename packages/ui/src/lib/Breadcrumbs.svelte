<script lang="ts">
	import { buildBreadcrumbs } from './navigation';

	let { slug }: { slug?: string } = $props();
	const items = $derived(buildBreadcrumbs(slug));
</script>

<nav aria-label="Breadcrumbs" class="breadcrumbs">
	<ol>
		{#each items as item, index (item.href)}
			{@const isLast = index === items.length - 1}
			<li>
				{#if isLast}
					<span aria-current="page">{item.title}</span>
				{:else}
					<a href={item.href}>{item.title}</a>
				{/if}
			</li>
		{/each}
	</ol>
</nav>

<style>
	.breadcrumbs ol {
		display: flex;
		flex-wrap: wrap;
		gap: 0.35rem;
		list-style: none;
		margin: 0;
		padding: 0;
		font-size: 0.8rem;
		color: var(--svartz-muted, #9ca3af);
	}

	.breadcrumbs li {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
	}

	.breadcrumbs li:not(:last-child)::after {
		content: '/';
		opacity: 0.5;
	}

	.breadcrumbs a {
		color: inherit;
		text-decoration: none;
	}

	.breadcrumbs a:hover {
		text-decoration: underline;
	}
</style>
