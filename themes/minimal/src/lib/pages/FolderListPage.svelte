<script lang="ts">
	import type { ThemePageProps } from '@svartz/ui';
	import ListHeader from '../components/ListHeader.svelte';
	import PageList from '../components/PageList.svelte';
	import { count } from '../listing.js';
	import { tagHrefFor } from '../routes.js';

	let { vault }: ThemePageProps = $props();

	const topLevel = $derived(vault.folders.filter((folder) => !folder.slug.includes('/')));
</script>

<ListHeader title="Folders" summary="Found {count(vault.folders.length, 'folder')}." />
<PageList notes={[]} folders={topLevel} tagHref={tagHrefFor(vault)} />
