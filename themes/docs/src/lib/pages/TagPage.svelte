<script lang="ts">
	import { count, notesTagged, type ThemePageProps } from '@svartz/ui';
	import PageTitle from '../components/PageTitle.svelte';
	import SymbolTable from '../components/SymbolTable.svelte';
	import { groupByKind } from '../symbols.js';

	let { vault, match }: ThemePageProps = $props();

	const slug = $derived(match?.params.slug ?? '');
	const tag = $derived(vault.tags.find((candidate) => candidate.slug === slug));
	const entries = $derived(notesTagged(vault.entries, slug));
	const pages = $derived(entries.filter((entry) => !groupByKind([entry]).length));
</script>

<PageTitle title="#{tag?.title ?? slug}" summary="{count(entries.length, 'page')} tagged." />
<SymbolTable {entries} />
{#if pages.length > 0}
	<ul>
		{#each pages as entry (entry.slug)}<li><a href={entry.href} data-sv-internal>{entry.title}</a></li>{/each}
	</ul>
{/if}
