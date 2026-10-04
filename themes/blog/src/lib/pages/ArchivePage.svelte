<script lang="ts">
	import { count, formatDate, isoDate, type ThemePageProps } from '@svartz/ui';
	import { archive, blogPosts, postDate } from '../blog.js';
	import PageHeader from '../components/PageHeader.svelte';

	let { vault }: ThemePageProps = $props();

	const posts = $derived(blogPosts(vault.entries));
	const years = $derived(archive(posts));
</script>

<PageHeader title="Archive" summary="{count(posts.length, 'post')}, newest first." />
<div class="archive">
	{#each years as year (year.year)}
		<section aria-labelledby="year-{year.year}">
			<h2 id="year-{year.year}">{year.year}</h2>
			{#each year.months as month (month.month)}
				<h3 class="sv-label">{month.month}</h3>
				<ul>
					{#each month.posts as post (post.slug)}
						{@const date = postDate(post)}
						<li>
							{#if date}<time datetime={isoDate(date)}>{formatDate(date)}</time>{/if}
							<a href={post.href} data-sv-internal>{post.title}</a>
						</li>
					{/each}
				</ul>
			{/each}
		</section>
	{/each}
</div>

<style>
	.archive {
		max-inline-size: 44rem;
		margin-inline: auto;
	}

	section {
		display: grid;
		grid-template-columns: 6rem minmax(0, 1fr);
		column-gap: var(--sv-space-5);
		margin-block-end: var(--sv-space-7);
	}

	h2 {
		grid-row: span 99;
		margin: 0;
		color: var(--sv-ink);
		font-size: var(--sv-step-3);
		font-weight: 700;
		line-height: 1;
	}

	h3 {
		margin: 0 0 var(--sv-space-2);
	}

	ul {
		display: grid;
		gap: var(--sv-space-2);
		margin: 0 0 var(--sv-space-5);
		padding: 0;
		list-style: none;
	}

	li {
		display: grid;
		grid-template-columns: 7rem minmax(0, 1fr);
		gap: var(--sv-space-3);
		align-items: baseline;
	}

	time {
		color: var(--sv-muted);
		font-size: var(--sv-step--1);
		font-variant-numeric: tabular-nums;
	}

	a {
		color: var(--sv-ink);
		font-weight: 600;
		text-decoration: none;
	}

	a:hover {
		color: var(--sv-accent-text);
	}

	@media (max-width: 36rem) {
		section,
		li {
			grid-template-columns: minmax(0, 1fr);
		}

		h2 {
			grid-row: auto;
			margin-block-end: var(--sv-space-3);
		}
	}
</style>
