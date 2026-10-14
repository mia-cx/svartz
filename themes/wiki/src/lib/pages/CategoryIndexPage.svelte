<script lang="ts">
	import { count, type ThemePageProps } from '@svartz/ui';
	import PageTitle from '../components/PageTitle.svelte';

	let { vault }: ThemePageProps = $props();

	const tags = $derived([...vault.tags].sort((left, right) => left.title.localeCompare(right.title)));
</script>

<PageTitle title="Categories" summary="{count(tags.length, 'category')}." />
<ul class="categories">
	{#each tags as tag (tag.slug)}
		<li>
			<a href={tag.href}>{tag.title}</a>
			<span class="sv-label">{count(tag.noteCount, 'page')}</span>
		</li>
	{/each}
</ul>

<style>
	.categories {
		columns: 16rem 3;
		column-gap: var(--sv-space-6);
		margin: 0;
		padding: 0;
		list-style: none;
	}

	li {
		display: flex;
		justify-content: space-between;
		gap: var(--sv-space-3);
		break-inside: avoid;
		padding-block: var(--sv-space-1);
		border-block-end: var(--sv-rule-width) solid var(--sv-rule);
	}

	a {
		color: var(--sv-ink);
		font-weight: 600;
		text-decoration: none;
	}

	a:hover {
		color: var(--sv-accent-text);
	}
</style>
