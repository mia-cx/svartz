<!-- The main page: the home note, then the featured article, recent changes, and category portals. -->
<script lang="ts">
	import { count, formatDate, isoDate, newestFirst, noteDate, type ThemePageProps } from '@svartz/ui';
	import { featuredNote, wikiRoutes } from '../wiki.js';

	let { children, entry, vault, themeConfig }: ThemePageProps = $props();

	const RECENT_ON_MAIN_PAGE = 6;

	const featured = $derived(featuredNote(vault.entries));
	const recent = $derived(newestFirst(vault.entries.filter((note) => note !== entry)).slice(0, RECENT_ON_MAIN_PAGE));
	const feedHref = $derived(`${vault.routes.mountPath}/${wikiRoutes(themeConfig).feed}/`);
</script>

<article class="sv-prose">{@render children?.()}</article>

<div class="main-page">
	{#if featured}
		<section class="panel featured" aria-labelledby="featured-heading">
			<h2 id="featured-heading" class="sv-section-title">Featured article</h2>
			<p class="featured-title"><a href={featured.href} data-sv-internal>{featured.title}</a></p>
			{#if featured.description}<p>{featured.description}</p>{/if}
			<a class="more" href={featured.href}>Read the article</a>
		</section>
	{/if}
	<section class="panel" aria-labelledby="recent-heading">
		<h2 id="recent-heading" class="sv-section-title">Recent changes</h2>
		<ul class="recent">
			{#each recent as note (note.slug)}
				{@const date = noteDate(note)}
				<li>
					<a href={note.href} data-sv-internal>{note.title}</a>
					{#if date}<time class="sv-label" datetime={isoDate(date)}>{formatDate(date)}</time>{/if}
				</li>
			{/each}
		</ul>
		<a class="more" href={feedHref}>All recent changes</a>
	</section>
	<section class="panel" aria-labelledby="categories-heading">
		<h2 id="categories-heading" class="sv-section-title">Categories</h2>
		<ul class="category-pills">
			{#each vault.tags as tag (tag.slug)}
				<li><a class="sv-tag" href={tag.href}>{tag.title}</a></li>
			{/each}
		</ul>
		<p class="stat">{count(vault.entries.length, 'page')} in this wiki.</p>
	</section>
</div>

<style>
	.main-page {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(16rem, 1fr));
		gap: var(--sv-space-4);
		margin-block-start: var(--sv-space-6);
	}

	.panel {
		display: grid;
		align-content: start;
		gap: var(--sv-space-2);
		padding: var(--sv-space-4);
		border: var(--sv-rule-width) solid var(--sv-rule);
		border-radius: var(--sv-radius-m);
	}

	.panel p {
		margin: 0;
	}

	.featured {
		grid-column: 1 / -1;
		background: var(--sv-surface);
	}

	.featured-title a {
		color: var(--sv-ink);
		font-size: var(--sv-step-2);
		font-weight: 700;
		text-decoration: none;
	}

	.more {
		color: var(--sv-accent-text);
		font-size: var(--sv-step--1);
		font-weight: 600;
	}

	.recent,
	.category-pills {
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.recent li {
		display: flex;
		justify-content: space-between;
		gap: var(--sv-space-3);
		padding-block: var(--sv-space-1);
		border-block-end: var(--sv-rule-width) solid var(--sv-rule);
	}

	.recent a {
		color: var(--sv-ink);
		text-decoration: none;
	}

	.recent a:hover {
		color: var(--sv-accent-text);
	}

	.category-pills {
		display: flex;
		flex-wrap: wrap;
		gap: var(--sv-space-1);
	}

	.stat {
		color: var(--sv-muted);
		font-size: var(--sv-step--1);
	}
</style>
