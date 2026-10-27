<!--
	Breadcrumbs on every page; for a plain note, also its title, date and
	reading time, tags, and page actions. Pages a theme renders head
	themselves under the breadcrumbs.
-->
<script lang="ts">
	import { DescText, formatDate, isoDate, PageActions, pageCrumbs, readingTime, tagHrefFor } from '@svartz/ui';
	import type { RegionProps } from '../extension.js';

	let { shell }: RegionProps = $props();

	const crumbs = $derived(pageCrumbs(shell.vault, shell.entry, shell.match));
	const tagHref = $derived(tagHrefFor(shell.vault));
	const entry = $derived(shell.page ? undefined : shell.entry);
	const date = $derived(entry ? (entry.modifiedAt ?? entry.publishedAt ?? entry.createdAt) : undefined);
</script>

{#if crumbs.length > 0}
	<nav class="crumbs" aria-label="Breadcrumbs">
		<ol>
			{#each crumbs as crumb, index (crumb.href)}
				<li>
					{#if index === crumbs.length - 1}<span aria-current="page">{crumb.title}</span>{:else}<a href={crumb.href}>{crumb.title}</a>{/if}
				</li>
			{/each}
		</ol>
	</nav>
{/if}
{#if entry}
	<header class="note-head">
		<h1>{entry.title}</h1>
		{#if shell.chrome.summary && entry.description}<p class="summary"><DescText value={entry.description} entries={shell.vault.entries} /></p>{/if}
		{#if shell.chrome.dates && (date || entry.readingTimeMinutes)}
			<p class="meta sv-label">
				{#if date}<time datetime={isoDate(date)}>{formatDate(date)}</time>{/if}
				<span>{readingTime(entry.readingTimeMinutes)}</span>
			</p>
		{/if}
		{#if entry.tags.length > 0}
			<ul class="tags" aria-label="Tags">
				{#each entry.tags as tag (tag)}
					<li><a class="sv-tag" href={tagHref(tag)}>{tag}</a></li>
				{/each}
			</ul>
		{/if}
		{#if entry.markdownHref}<PageActions href={entry.markdownHref} />{/if}
	</header>
{/if}

<style>
	.crumbs ol {
		display: flex;
		flex-wrap: wrap;
		gap: var(--sv-space-1);
		margin: 0 0 var(--sv-space-3);
		padding: 0;
		list-style: none;
		font-size: var(--sv-step--1);
	}

	.crumbs li:not(:last-child)::after {
		content: '/';
		margin-inline-start: var(--sv-space-1);
		color: var(--sv-rule-strong);
	}

	.crumbs a {
		color: var(--sv-muted);
		text-decoration: none;
	}

	.crumbs a:hover {
		color: var(--sv-accent-text);
	}

	.crumbs [aria-current] {
		color: var(--sv-ink);
	}

	.note-head {
		margin-block-end: var(--sv-space-6);
	}

	.note-head h1 {
		margin: 0;
		color: var(--sv-ink);
		font-family: var(--sv-font-sans);
		font-size: var(--sv-step-5);
		font-weight: 700;
		line-height: 1.05;
		text-wrap: balance;
	}

	.summary {
		margin: var(--sv-space-3) 0 0;
		color: var(--sv-text);
		font-size: var(--sv-step-1);
	}

	.meta {
		display: flex;
		flex-wrap: wrap;
		gap: var(--sv-space-3);
		margin: var(--sv-space-3) 0 0;
	}

	.tags {
		display: flex;
		flex-wrap: wrap;
		gap: var(--sv-space-1);
		margin: var(--sv-space-3) 0 0;
		padding: 0;
		list-style: none;
	}

	@media (max-width: 50rem) {
		.note-head h1 {
			font-size: var(--sv-step-4);
		}
	}
</style>
