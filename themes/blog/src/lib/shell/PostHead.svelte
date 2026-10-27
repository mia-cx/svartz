<!-- Above a post: its primary tag, title, excerpt, byline, page actions, and cover. Other pages head themselves. -->
<script lang="ts">
	import type { RegionProps } from '@svartz/theme-minimal/runtime';
	import { assetHref, formatDate, isoDate, PageActions, readingTime, tagHrefFor } from '@svartz/ui';
	import { postDate, postOf, readPost } from '../blog.js';

	let { shell }: RegionProps = $props();

	const post = $derived(postOf(shell));
	const meta = $derived(post && readPost(post.properties, post.description));
	const cover = $derived(post && meta?.cover ? assetHref(shell.vault, post, meta.cover) : undefined);
	const date = $derived(post && postDate(post));
	const tagHref = $derived(tagHrefFor(shell.vault));
</script>

{#if post && meta}
	<header class="post-head">
		{#if post.tags[0]}<a class="sv-label primary-tag" href={tagHref(post.tags[0])}>{post.tags[0]}</a>{/if}
		<h1>{post.title}</h1>
		{#if meta.excerpt}<p class="excerpt">{meta.excerpt}</p>{/if}
		<p class="byline sv-label">
			{#if meta.author}<span>{meta.author}</span>{/if}
			{#if date}<time datetime={isoDate(date)}>{formatDate(date)}</time>{/if}
			<span>{readingTime(post.readingTimeMinutes)}</span>
		</p>
		{#if post.markdownHref}<PageActions href={post.markdownHref} />{/if}
	</header>
	{#if cover}
		<figure class="post-cover">
			<img src={cover} alt={meta.coverAlt ?? ''} />
		</figure>
	{/if}
{/if}

<style>
	.post-head {
		max-inline-size: 48rem;
		margin: var(--sv-space-6) auto var(--sv-space-6);
		text-align: center;
	}

	.primary-tag {
		color: var(--sv-accent-text);
		text-decoration: none;
	}

	.post-head h1 {
		margin: var(--sv-space-3) 0 0;
		color: var(--sv-ink);
		font-size: var(--sv-step-5);
		font-weight: 700;
		line-height: 1.08;
		text-wrap: balance;
	}

	.excerpt {
		margin: var(--sv-space-4) 0 0;
		color: var(--sv-text);
		font-size: var(--sv-step-1);
		text-wrap: pretty;
	}

	.byline {
		display: flex;
		flex-wrap: wrap;
		justify-content: center;
		gap: var(--sv-space-3);
		margin: var(--sv-space-4) 0 0;
	}

	.post-head :global(.sv-page-actions) {
		justify-content: center;
	}

	.post-cover {
		max-inline-size: 64rem;
		margin: 0 auto var(--sv-space-7);
	}

	.post-cover img {
		display: block;
		inline-size: 100%;
		block-size: auto;
		border-radius: var(--sv-radius-m);
	}
</style>
