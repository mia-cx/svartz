<!-- Below an article: its categories bar, what links here, and when it was last edited. The main page has none. -->
<script lang="ts">
	import type { RegionProps } from '@svartz/theme-minimal/runtime';
	import { formatDate, isoDate, noteDate, tagHrefFor } from '@svartz/ui';
	import { wikiRoutes } from '../wiki.js';

	let { shell }: RegionProps = $props();

	const entry = $derived(shell.currentHref === shell.homeHref ? undefined : shell.entry);
	const tagHref = $derived(tagHrefFor(shell.vault));
	const categoriesHref = $derived(`${shell.vault.routes.mountPath}/${wikiRoutes(shell.themeConfig).tags}/`);
	const linksHere = $derived(entry ? (shell.vault.note(entry.slug)?.backlinks ?? []) : []);
	const edited = $derived(entry ? noteDate(entry) : undefined);
</script>

{#if entry}
	<footer class="article-foot">
		{#if entry.tags.length > 0}
			<div class="categories">
				<span><a class="categories-label" href={categoriesHref}>Categories</a>:</span>
				<ul>
					{#each entry.tags as tag (tag)}<li><a href={tagHref(tag)}>{tag}</a></li>{/each}
				</ul>
			</div>
		{/if}
		{#if linksHere.length > 0}
			<section class="links-here" aria-labelledby="links-here-heading">
				<h2 id="links-here-heading" class="sv-section-title">What links here</h2>
				<ul>
					{#each linksHere as note (note.slug)}<li><a href={note.href} data-sv-internal>{note.title}</a></li>{/each}
				</ul>
			</section>
		{/if}
		{#if edited}
			<p class="edited">This page was last edited on <time datetime={isoDate(edited)}>{formatDate(edited)}</time>.</p>
		{/if}
	</footer>
{/if}

<style>
	.article-foot {
		display: grid;
		gap: var(--sv-space-4);
		margin-block-start: var(--sv-space-7);
		clear: both;
	}

	.categories {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: var(--sv-space-2);
		padding: var(--sv-space-2) var(--sv-space-3);
		border: var(--sv-rule-width) solid var(--sv-rule);
		border-radius: var(--sv-radius-m);
		background: var(--sv-surface);
		font-size: var(--sv-step--1);
	}

	.categories ul {
		display: flex;
		flex-wrap: wrap;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.categories li:not(:last-child)::after {
		content: '|';
		margin-inline: var(--sv-space-2);
		color: var(--sv-rule-strong);
	}

	.categories a {
		color: var(--sv-ink);
	}

	.categories-label {
		font-weight: 700;
	}

	.links-here ul {
		display: flex;
		flex-wrap: wrap;
		gap: var(--sv-space-1) var(--sv-space-4);
		margin: var(--sv-space-2) 0 0;
		padding: 0;
		list-style: none;
		font-size: var(--sv-step--1);
	}

	.links-here a {
		color: var(--sv-ink);
		text-decoration: none;
	}

	.links-here a:hover {
		color: var(--sv-accent-text);
	}

	.edited {
		margin: 0;
		color: var(--sv-muted);
		font-size: var(--sv-step--1);
	}
</style>
