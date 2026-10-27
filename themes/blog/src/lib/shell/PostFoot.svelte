<!-- Below a post: its tags, then the previous and next pages in reading order. -->
<script lang="ts">
	import type { RegionProps } from '@svartz/theme-minimal/runtime';
	import { tagHrefFor } from '@svartz/ui';
	import { postOf } from '../blog.js';

	let { shell }: RegionProps = $props();

	const post = $derived(postOf(shell));
	const tagHref = $derived(tagHrefFor(shell.vault));
	const adjacent = $derived(shell.chrome.pageNav && (shell.previous || shell.next));
</script>

{#if post && (post.tags.length > 0 || adjacent)}
	<footer class="post-foot">
		{#if post.tags.length > 0}
			<ul class="post-tags" aria-label="Tags">
				{#each post.tags as tag (tag)}<li><a class="sv-tag" href={tagHref(tag)}>{tag}</a></li>{/each}
			</ul>
		{/if}
		{#if adjacent}
			<nav class="adjacent" aria-label="Previous and next">
				{#if shell.previous}
					<a class="adjacent-link" href={shell.previous.href} rel="prev"><span class="sv-label">Previous</span>{shell.previous.title}</a>
				{:else}<span></span>{/if}
				{#if shell.next}
					<a class="adjacent-link next" href={shell.next.href} rel="next"><span class="sv-label">Next</span>{shell.next.title}</a>
				{/if}
			</nav>
		{/if}
	</footer>
{/if}

<style>
	.post-foot {
		display: grid;
		gap: var(--sv-space-6);
		max-inline-size: var(--sv-measure);
		margin: var(--sv-space-7) auto 0;
	}

	.post-tags {
		display: flex;
		flex-wrap: wrap;
		gap: var(--sv-space-2);
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.adjacent {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: var(--sv-space-4);
		padding-block-start: var(--sv-space-5);
		border-block-start: var(--sv-rule-width) solid var(--sv-rule);
	}

	.adjacent-link {
		display: grid;
		gap: var(--sv-space-1);
		color: var(--sv-ink);
		font-weight: 600;
		text-decoration: none;
	}

	.adjacent-link:hover {
		color: var(--sv-accent-text);
	}

	.adjacent-link.next {
		text-align: end;
	}
</style>
