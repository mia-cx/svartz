<script lang="ts">
	import { count, tagHrefFor, type ThemePageProps } from '@svartz/ui';
	import ListHeader from '../components/ListHeader.svelte';
	import PageList from '../components/PageList.svelte';

	let { vault }: ThemePageProps = $props();

	const topLevel = $derived(vault.folders.filter((folder) => !folder.slug.includes('/')));
</script>

<ListHeader title="Folders" summary="Found {count(vault.folders.length, 'folder')}." />
<PageList notes={[]} folders={topLevel} tagHref={tagHrefFor(vault)} />
