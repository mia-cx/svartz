<!--
	Minimal: Quartz's layout in the Svartz design language. Left: site name,
	search, colour mode, reader mode, explorer. Centre: breadcrumbs, title,
	meta, tags, note. Right: graph, contents, backlinks. List pages keep the
	right column empty so the reading column never moves.
-->
<script lang="ts">
	import '@svartz/ui/base.css';
	import '@svartz/ui/prose.css';
	import { afterNavigate } from '$app/navigation';
	import { page } from '$app/state';
	import BookOpen from '@lucide/svelte/icons/book-open';
	import Menu from '@lucide/svelte/icons/menu';
	import X from '@lucide/svelte/icons/x';
	import {
		ColorModeToggle,
		Comments,
		formatDate,
		isoDate,
		LinkPreviews,
		readingTime,
		SearchDialog,
		type ThemePageProps
	} from '@svartz/ui';
	import Backlinks from '../components/Backlinks.svelte';
	import Explorer from '../components/Explorer.svelte';
	import Graph from '../components/Graph.svelte';
	import Toc from '../components/Toc.svelte';
	import { minimalConfig } from '../config.js';
	import { pageCrumbs, tagHrefFor } from '../routes.js';

	let { children, entry, vault, site, match, themeConfig, searchIndex, searchOptions }: ThemePageProps = $props();

	const config = $derived(minimalConfig(themeConfig));
	const homeHref = $derived(`${vault.routes.mountPath}/`);
	const currentHref = $derived(page.url.pathname);
	const noteLayout = $derived(Boolean(entry));
	const crumbs = $derived(pageCrumbs(vault, entry, match));
	const tagHref = $derived(tagHrefFor(vault));
	const backlinks = $derived(entry ? (vault.note(entry.slug)?.backlinks ?? []) : []);
	const date = $derived(entry ? (entry.modifiedAt ?? entry.publishedAt ?? entry.createdAt) : undefined);
	// Notes only: list pages and 404s must not open discussions.
	const comments = $derived(entry?.page.comments ? config.comments : undefined);

	let reader = $state(false);
	let drawer = $state(false);
	afterNavigate(() => (drawer = false));
</script>

<a class="sv-skip-link" href="#content">Skip to content</a>

<div class="minimal" data-layout={noteLayout ? 'note' : 'list'} data-reader={reader ? '' : undefined}>
	<aside class="left" aria-label="Site">
		<div class="masthead">
			<button
				class="sv-icon-button menu"
				type="button"
				aria-expanded={drawer}
				aria-controls="explorer-panel"
				aria-label={drawer ? 'Close the explorer' : 'Open the explorer'}
				onclick={() => (drawer = !drawer)}
			>
				{#if drawer}<X aria-hidden="true" />{:else}<Menu aria-hidden="true" />{/if}
			</button>
			<a class="sv-wordmark" href={homeHref}>{site.title}</a>
		</div>
		<div class="tools">
			<SearchDialog documents={vault.search} {searchIndex} {searchOptions} />
			<ColorModeToggle />
			<button
				class="sv-icon-button reader-toggle"
				type="button"
				aria-pressed={reader}
				aria-label="Reader mode"
				onclick={() => (reader = !reader)}
			>
				<BookOpen aria-hidden="true" />
			</button>
		</div>
		<div class="explorer-panel" id="explorer-panel" data-open={drawer ? '' : undefined}>
			<Explorer entries={vault.entries} folders={vault.folders} {currentHref} />
		</div>
	</aside>

	<main class="center" id="content" tabindex="-1">
		{#if crumbs.length > 0}
			<nav class="crumbs" aria-label="Breadcrumbs">
				<ol>
					{#each crumbs as crumb, index (crumb.href)}
						<li>
							{#if index === crumbs.length - 1}<span aria-current="page">{crumb.title}</span>{:else}<a
									href={crumb.href}>{crumb.title}</a
								>{/if}
						</li>
					{/each}
				</ol>
			</nav>
		{/if}
		<div data-sv-preview>
			{#if entry}
				<header class="note-head">
					<h1>{entry.title}</h1>
					{#if date || entry.readingTimeMinutes}
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
				</header>
				<article class="sv-prose">{@render children?.()}</article>
			{:else}
				{@render children?.()}
			{/if}
		</div>
		{#if comments}
			<Comments {...comments} />
		{/if}
	</main>

	<aside class="right" aria-label="Related">
		{#if entry}
			<Graph
				input={{ notes: vault.entries, links: vault.graph, tagHref }}
				center={entry.slug}
			/>
			{#if entry.page.toc}<div class="toc"><Toc items={entry.toc} /></div>{/if}
			<Backlinks notes={backlinks} />
		{/if}
	</aside>

	<footer class="footer">
		<p>
			{[site.title, site.author].filter(Boolean).join(' · ')}{' · '}Published with
			<a href="https://github.com/mia-cx/svartz">Svartz</a>
		</p>
		{#if config.footerLinks.length > 0}
			<ul>
				{#each config.footerLinks as link (link.href)}
					<li><a href={link.href}>{link.label}</a></li>
				{/each}
			</ul>
		{/if}
	</footer>
</div>

<LinkPreviews />

<style>
	:global(:root) {
		--sv-density: 1;
		--sv-ratio: 1.2;
		--sv-measure: 44rem;
	}

	.minimal {
		--side: 16rem;
		/* Quartz's top spacing: all three columns start 6rem down. */
		--top: 6rem;
		display: grid;
		grid-template-columns: var(--side) minmax(0, 1fr) var(--side);
		grid-template-areas:
			'left center right'
			'left footer right';
		grid-template-rows: 1fr auto;
		column-gap: clamp(var(--sv-space-5), 3vw, var(--sv-space-7));
		max-inline-size: 92rem;
		min-block-size: 100dvh;
		margin-inline: auto;
		padding-inline: var(--sv-space-5);
	}

	.left,
	.right {
		position: sticky;
		inset-block-start: 0;
		display: flex;
		flex-direction: column;
		gap: var(--sv-space-5);
		align-self: start;
		max-block-size: 100dvh;
		padding-block: var(--top) var(--sv-space-5);
		overflow-y: auto;
		overscroll-behavior: contain;
		scrollbar-width: thin;
		transition: opacity var(--sv-duration) var(--sv-ease);
	}

	.left {
		grid-area: left;
		z-index: var(--sv-z-sticky);
	}

	.right {
		grid-area: right;
	}

	[data-reader] .left,
	[data-reader] .right {
		opacity: 0.08;
	}

	[data-reader] .left:is(:hover, :focus-within),
	[data-reader] .right:is(:hover, :focus-within) {
		opacity: 1;
	}

	.masthead {
		display: flex;
		align-items: center;
		gap: var(--sv-space-2);
	}

	.masthead .sv-wordmark {
		font-size: var(--sv-step-2);
		text-wrap: balance;
	}

	.menu {
		display: none;
	}

	.tools {
		display: flex;
		align-items: center;
		gap: var(--sv-space-1);
	}

	.tools :global(.sv-search-trigger[data-variant='field']) {
		flex: 1;
		min-inline-size: 0;
	}

	.reader-toggle[aria-pressed='true'] {
		background: var(--sv-surface);
		color: var(--sv-ink);
	}

	.center {
		grid-area: center;
		min-inline-size: 0;
		padding-block: var(--top) var(--sv-space-6);
		outline: none;
	}

	.center > * {
		max-inline-size: var(--sv-measure);
		margin-inline: auto;
	}

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
		letter-spacing: -0.02em;
		line-height: 1.05;
		text-wrap: balance;
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

	.footer {
		grid-area: footer;
		display: flex;
		flex-wrap: wrap;
		gap: var(--sv-space-2) var(--sv-space-5);
		justify-content: space-between;
		inline-size: 100%;
		max-inline-size: var(--sv-measure);
		margin-inline: auto;
		padding-block: var(--sv-space-5) var(--sv-space-7);
		border-block-start: var(--sv-rule-width) solid var(--sv-rule);
		color: var(--sv-muted);
		font-size: var(--sv-step--1);
	}

	.footer p {
		margin: 0;
	}

	.footer ul {
		display: flex;
		gap: var(--sv-space-4);
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.footer a {
		color: var(--sv-text);
		text-decoration-color: var(--sv-rule-strong);
		text-underline-offset: 0.2em;
	}

	.footer a:hover {
		color: var(--sv-accent-text);
	}

	/* Tablet: the right column moves under the note; contents hide, as in Quartz. */
	@media (max-width: 75rem) {
		.minimal {
			--side: 15rem;
			grid-template-columns: var(--side) minmax(0, 1fr);
			grid-template-areas:
				'left center'
				'left right'
				'left footer';
			grid-template-rows: auto auto 1fr;
		}

		.right {
			position: static;
			display: grid;
			grid-template-columns: repeat(auto-fit, minmax(14rem, 1fr));
			align-items: start;
			inline-size: 100%;
			max-inline-size: var(--sv-measure);
			max-block-size: none;
			margin-inline: auto;
			padding-block: 0 var(--sv-space-6);
			overflow: visible;
		}

		.right:empty {
			display: none;
		}

		.toc {
			display: none;
		}
	}

	/* Phone: the left column becomes a sticky bar; the explorer becomes a drawer. */
	@media (max-width: 50rem) {
		.minimal {
			grid-template-columns: minmax(0, 1fr);
			grid-template-areas: 'left' 'center' 'right' 'footer';
			grid-template-rows: auto;
			padding-inline: var(--sv-space-4);
		}

		.left {
			flex-direction: row;
			flex-wrap: wrap;
			align-items: center;
			justify-content: space-between;
			gap: var(--sv-space-2);
			max-block-size: none;
			margin-inline: calc(-1 * var(--sv-space-4));
			padding: var(--sv-space-2) var(--sv-space-3);
			overflow: visible;
			border-block-end: var(--sv-rule-width) solid var(--sv-rule);
			background: var(--sv-paper);
		}

		.menu {
			display: inline-grid;
		}

		.masthead {
			flex: 1;
			min-inline-size: 0;
		}

		.masthead .sv-wordmark {
			overflow: hidden;
			font-size: var(--sv-step-1);
			text-overflow: ellipsis;
			white-space: nowrap;
		}

		.tools :global(.sv-search-trigger[data-variant='field']) {
			flex: none;
			inline-size: 2.25rem;
			padding: 0;
			justify-content: center;
			border-color: transparent;
		}

		.tools :global(.sv-search-trigger-label),
		.tools :global(.sv-search-trigger-keys),
		.reader-toggle {
			display: none;
		}

		.explorer-panel {
			position: fixed;
			inset: var(--sv-drawer-top, 3.3rem) 0 0;
			z-index: var(--sv-z-drawer);
			padding: var(--sv-space-4) var(--sv-space-5) var(--sv-space-7);
			overflow-y: auto;
			background: var(--sv-paper);
			translate: -100% 0;
			visibility: hidden;
			transition:
				translate var(--sv-duration-slow) var(--sv-ease),
				visibility 0s linear var(--sv-duration-slow);
		}

		.explorer-panel[data-open] {
			translate: 0 0;
			visibility: visible;
			transition: translate var(--sv-duration-slow) var(--sv-ease);
		}

		.center {
			padding-block-start: var(--sv-space-5);
		}

		.note-head h1 {
			font-size: var(--sv-step-4);
		}
	}
</style>
