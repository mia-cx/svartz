<script lang="ts">
	import { count, folderContents, type ThemePageProps } from '@svartz/ui';
	import AzList from '../components/AzList.svelte';
	import PageTitle from '../components/PageTitle.svelte';

	let { vault, match }: ThemePageProps = $props();

	const slug = $derived(match?.params.slug ?? '');
	const folder = $derived(vault.folders.find((candidate) => candidate.slug === slug));
	const notes = $derived(folderContents(slug, vault.entries, vault.folders).notes);
</script>

<PageTitle title="Pages in {folder?.title ?? slug}" summary="{count(notes.length, 'page')}." />
<AzList {notes} />
