<script lang="ts">
	import { count, notesTagged, type ThemePageProps } from '@svartz/ui';
	import { blogPosts } from '../blog.js';
	import PageHeader from '../components/PageHeader.svelte';
	import PostGrid from '../components/PostGrid.svelte';

	let { vault, match }: ThemePageProps = $props();

	const slug = $derived(match?.params.slug ?? '');
	const tag = $derived(vault.tags.find((candidate) => candidate.slug === slug));
	const posts = $derived(blogPosts(notesTagged(vault.entries, slug)));
</script>

<PageHeader label="Tag" title={tag?.title ?? slug} summary={count(posts.length, 'post')} />
<PostGrid {posts} {vault} filter={false} />
