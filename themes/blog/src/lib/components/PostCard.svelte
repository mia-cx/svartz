<!-- A post in a grid: cover, primary tag, title, excerpt, and byline. `featured` lays it out wide. -->
<script lang="ts">
	import type { IndexEntry, VaultView } from '@svartz/core';
	import { assetHref, formatDate, isoDate, readingTime } from '@svartz/ui';
	import { postDate, readPost } from '../blog.js';

	let { post, vault, featured = false }: { post: IndexEntry; vault: VaultView; featured?: boolean } = $props();

	const meta = $derived(readPost(post.properties, post.description));
	const cover = $derived(meta.cover ? assetHref(vault, meta.cover) : undefined);
	const date = $derived(postDate(post));
</script>

<article class="card" class:featured data-has-cover={cover ? '' : undefined}>
	{#if cover}
		<a class="cover" href={post.href} tabindex="-1" aria-hidden="true">
			<img src={cover} alt="" loading={featured ? 'eager' : 'lazy'} />
		</a>
	{/if}
	<div class="body">
		{#if post.tags[0]}<p class="sv-label primary-tag">{post.tags[0]}</p>{/if}
		<h2 class="title"><a href={post.href} data-sv-internal>{post.title}</a></h2>
		{#if meta.excerpt}<p class="excerpt">{meta.excerpt}</p>{/if}
		<p class="byline sv-label">
			{#if meta.author}<span>{meta.author}</span>{/if}
			{#if date}<time datetime={isoDate(date)}>{formatDate(date)}</time>{/if}
			<span>{readingTime(post.readingTimeMinutes)}</span>
		</p>
	</div>
</article>

<style>
	.card {
		display: grid;
		align-content: start;
		gap: var(--sv-space-4);
	}

	.cover {
		display: block;
		overflow: hidden;
		border-radius: var(--sv-radius-m);
		background: var(--sv-sunken);
		aspect-ratio: 3 / 2;
	}

	img {
		display: block;
		inline-size: 100%;
		block-size: 100%;
		object-fit: cover;
		transition: scale var(--sv-duration-slow) var(--sv-ease);
	}

	.card:hover img {
		scale: 1.02;
	}

	.body {
		display: grid;
		gap: var(--sv-space-2);
	}

	.primary-tag {
		margin: 0;
		color: var(--sv-accent-text);
	}

	.title {
		margin: 0;
		font-size: var(--sv-step-2);
		font-weight: 700;
		letter-spacing: -0.015em;
		line-height: 1.2;
		text-wrap: balance;
	}

	.title a {
		color: var(--sv-ink);
		text-decoration: none;
	}

	.title a:hover {
		color: var(--sv-accent-text);
	}

	/* The whole card is the title link's hit area. */
	.card {
		position: relative;
	}

	.title a::after {
		content: '';
		position: absolute;
		inset: 0;
	}

	.excerpt {
		display: -webkit-box;
		margin: 0;
		overflow: hidden;
		color: var(--sv-text);
		-webkit-box-orient: vertical;
		-webkit-line-clamp: 3;
		line-clamp: 3;
	}

	.byline {
		display: flex;
		flex-wrap: wrap;
		gap: var(--sv-space-3);
		margin: 0;
	}

	.featured {
		grid-template-columns: minmax(0, 3fr) minmax(0, 2fr);
		align-items: center;
		gap: var(--sv-space-7);
	}

	.featured:not([data-has-cover]) {
		grid-template-columns: minmax(0, 1fr);
	}

	.featured .title {
		font-size: var(--sv-step-4);
	}

	.featured .excerpt {
		font-size: var(--sv-step-1);
		-webkit-line-clamp: 4;
		line-clamp: 4;
	}

	@media (max-width: 50rem) {
		.featured {
			grid-template-columns: minmax(0, 1fr);
			gap: var(--sv-space-4);
		}

		.featured .title {
			font-size: var(--sv-step-3);
		}
	}
</style>
