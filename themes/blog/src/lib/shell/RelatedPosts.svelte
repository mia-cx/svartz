<!-- Under a post: up to three posts sharing its tags. -->
<script lang="ts">
	import type { RegionProps } from '@svartz/theme-minimal/runtime';
	import { blogPosts, postOf, relatedPosts } from '../blog.js';
	import PostCard from '../components/PostCard.svelte';

	let { shell }: RegionProps = $props();

	const post = $derived(postOf(shell));
	const related = $derived(post ? relatedPosts(post, blogPosts(shell.vault.entries)) : []);
</script>

{#if related.length > 0}
	<section class="related" aria-labelledby="related-heading">
		<h2 id="related-heading" class="sv-section-title">Related posts</h2>
		<div class="related-grid">
			{#each related as other (other.slug)}<PostCard post={other} vault={shell.vault} />{/each}
		</div>
	</section>
{/if}

<style>
	.related {
		margin-block-start: var(--sv-space-8);
		padding-block-start: var(--sv-space-6);
		border-block-start: var(--sv-rule-width) solid var(--sv-rule);
	}

	.related-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(18rem, 1fr));
		gap: var(--sv-space-6);
		margin-block-start: var(--sv-space-4);
	}
</style>
