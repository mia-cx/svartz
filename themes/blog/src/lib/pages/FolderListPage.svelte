<script lang="ts">
	import { count, type ThemePageProps } from '@svartz/ui';
	import PageHeader from '../components/PageHeader.svelte';

	let { vault }: ThemePageProps = $props();

	const series = $derived(vault.folders.filter((folder) => !folder.slug.includes('/')));
</script>

<PageHeader title="Series" summary="Posts grouped by the folder they live in." />
<ul class="series">
	{#each series as folder (folder.slug)}
		<li><a href={folder.href}>{folder.title}</a> <span class="sv-label">{count(folder.noteCount, 'post')}</span></li>
	{/each}
</ul>

<style>
	.series {
		display: grid;
		gap: var(--sv-space-3);
		max-inline-size: 36rem;
		margin: 0 auto;
		padding: 0;
		list-style: none;
	}

	li {
		display: flex;
		justify-content: space-between;
		padding-block-end: var(--sv-space-3);
		border-block-end: var(--sv-rule-width) solid var(--sv-rule);
	}

	a {
		color: var(--sv-ink);
		font-size: var(--sv-step-1);
		font-weight: 700;
		text-decoration: none;
	}
</style>
