<script lang="ts">
	import { count, folderContents, type ThemePageProps } from '@svartz/ui';
	import PageTitle from '../components/PageTitle.svelte';
	import SymbolTable from '../components/SymbolTable.svelte';
	import { groupByKind } from '../symbols.js';

	let { vault, match }: ThemePageProps = $props();

	const slug = $derived(match?.params.slug ?? '');
	const folder = $derived(vault.folders.find((candidate) => candidate.slug === slug));
	const entries = $derived(folderContents(slug, vault.entries, vault.folders).notes);
	const symbolCount = $derived(groupByKind(entries).reduce((total, group) => total + group.entries.length, 0));
	const guides = $derived(entries.filter((entry) => !groupByKind([entry]).length));
</script>

<PageTitle title={folder?.title ?? slug} mono={symbolCount > 0} summary={symbolCount ? `${count(symbolCount, 'exported symbol')}.` : undefined} />
<SymbolTable {entries} />
{#if guides.length > 0}
	<ul class="guides">
		{#each guides as guide (guide.slug)}<li><a href={guide.href} data-sv-internal>{guide.title}</a></li>{/each}
	</ul>
{/if}

<style>
	.guides {
		display: grid;
		gap: var(--sv-space-2);
		padding-inline-start: 1.1em;
	}

	a {
		color: var(--sv-ink);
		font-weight: 600;
	}
</style>
