<script lang="ts">
	import type { ThemePageProps } from '@svartz/ui';
	import ListHeader from '../components/ListHeader.svelte';
	import PageList from '../components/PageList.svelte';
	import { folderContents } from '../listing.js';
	import { tagHrefFor } from '../routes.js';

	let { vault, match }: ThemePageProps = $props();

	const slug = $derived(match?.params.slug ?? '');
	const folder = $derived(vault.folders.find((candidate) => candidate.slug === slug));
	const contents = $derived(folderContents(slug, vault.entries, vault.folders));
	const total = $derived(contents.notes.length + contents.folders.length);
</script>

<ListHeader
	label="Folder"
	title={folder?.title ?? slug.split('/').at(-1) ?? 'Folder'}
	count="{total} {total === 1 ? 'item' : 'items'}"
/>
<PageList notes={contents.notes} folders={contents.folders} tagHref={tagHrefFor(vault)} />
