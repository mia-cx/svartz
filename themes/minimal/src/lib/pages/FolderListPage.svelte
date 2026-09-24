<script lang="ts">
	import type { ThemePageProps } from '@svartz/ui';
	import ListHeader from '../components/ListHeader.svelte';
	import PageList from '../components/PageList.svelte';
	import { tagHrefFor } from '../routes.js';

	let { vault }: ThemePageProps = $props();

	const topLevel = $derived(vault.folders.filter((folder) => !folder.slug.includes('/')));
</script>

<ListHeader title="Folders" count="{vault.folders.length} {vault.folders.length === 1 ? 'folder' : 'folders'}" />
<PageList notes={[]} folders={topLevel} tagHref={tagHrefFor(vault)} />
