<script lang="ts">
	import { count, notesTagged, type ThemePageProps } from '@svartz/ui';
	import AzList from '../components/AzList.svelte';
	import PageTitle from '../components/PageTitle.svelte';

	let { vault, match }: ThemePageProps = $props();

	const slug = $derived(match?.params.slug ?? '');
	const tag = $derived(vault.tags.find((candidate) => candidate.slug === slug));
	const notes = $derived(notesTagged(vault.entries, slug));
</script>

<PageTitle title="Category: {tag?.title ?? slug}" summary="{count(notes.length, 'page')} in this category." />
<AzList {notes} />
