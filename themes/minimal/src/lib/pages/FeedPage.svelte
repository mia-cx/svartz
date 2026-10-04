<!-- Every note, newest first. A `feed` note in the vault supplies the title and intro. -->
<script lang="ts">
	import { newestFirst, tagHrefFor, type ThemePageProps } from '@svartz/ui';
	import ListHeader from '../components/ListHeader.svelte';
	import PageList from '../components/PageList.svelte';

	let { vault }: ThemePageProps = $props();

	const intro = $derived(vault.entries.find((entry) => entry.slug === 'feed'));
	const notes = $derived(newestFirst(vault.entries.filter((entry) => entry !== intro)));
</script>

<ListHeader title={intro?.title ?? 'Recent notes'} summary={intro?.description} />
<PageList {notes} tagHref={tagHrefFor(vault)} />
