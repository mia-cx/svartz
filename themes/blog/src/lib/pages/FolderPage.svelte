<script lang="ts">
	import { count, folderContents, type ThemePageProps } from '@svartz/ui';
	import { blogPosts } from '../blog.js';
	import PageHeader from '../components/PageHeader.svelte';
	import PostGrid from '../components/PostGrid.svelte';

	let { vault, match }: ThemePageProps = $props();

	const slug = $derived(match?.params.slug ?? '');
	const folder = $derived(vault.folders.find((candidate) => candidate.slug === slug));
	const posts = $derived(blogPosts(folderContents(slug, vault.entries, vault.folders).notes));
</script>

<PageHeader label="Series" title={folder?.title ?? slug} summary={count(posts.length, 'post')} />
<PostGrid {posts} {vault} />
