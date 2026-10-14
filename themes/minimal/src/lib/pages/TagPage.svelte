<script lang="ts">
	import { count, notesTagged, tagHrefFor, type ThemePageProps } from '@svartz/ui';
	import ListHeader from '../components/ListHeader.svelte';
	import PageList from '../components/PageList.svelte';

	let { vault, match }: ThemePageProps = $props();

	const slug = $derived(match?.params.slug ?? '');
	const tag = $derived(vault.tags.find((candidate) => candidate.slug === slug));
	const notes = $derived(notesTagged(vault.entries, slug));
</script>

<ListHeader title={tag?.title ?? slug} summary="{count(notes.length, 'note')} with this tag." />
<PageList {notes} tagHref={tagHrefFor(vault)} />
