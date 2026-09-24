<!-- Every note, newest first. A `feed` note in the vault supplies the title and intro. -->
<script lang="ts">
	import { newestFirst, tagHrefFor, type ThemePageProps } from '@svartz/ui';
	import ListHeader from '../components/ListHeader.svelte';
	import PageList from '../components/PageList.svelte';

	let { vault }: ThemePageProps = $props();

	const FEED_SLUGS = ['feed', 'feed/index'];
	const intro = $derived(vault.entries.find((entry) => FEED_SLUGS.includes(entry.slug)));
	const notes = $derived(newestFirst(vault.entries.filter((entry) => !FEED_SLUGS.includes(entry.slug))));
</script>

<ListHeader title={intro?.title ?? 'Recent notes'} summary={intro?.description} />
<PageList {notes} tagHref={tagHrefFor(vault)} />
