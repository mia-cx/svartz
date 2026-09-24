<script lang="ts">
	import { count, folderContents, tagHrefFor, type ThemePageProps } from '@svartz/ui';
	import ListHeader from '../components/ListHeader.svelte';
	import PageList from '../components/PageList.svelte';

	let { vault, match }: ThemePageProps = $props();

	const slug = $derived(match?.params.slug ?? '');
	const folder = $derived(vault.folders.find((candidate) => candidate.slug === slug));
	const contents = $derived(folderContents(slug, vault.entries, vault.folders));
</script>

<ListHeader
	title={folder?.title ?? slug.split('/').at(-1) ?? 'Folder'}
	summary="{count(contents.notes.length, 'note')} under this folder."
/>
<PageList notes={contents.notes} folders={contents.folders} tagHref={tagHrefFor(vault)} />
