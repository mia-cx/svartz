<!--
	Wiki: a header with a wide search, a left rail with the portal and numbered
	contents, and the article with its infobox, references, categories, and
	"what links here". The home note becomes the main page, with a featured
	article, recent changes, and category portals beneath it.
-->
<script lang="ts">
	import '@svartz/ui/base.css';
	import '@svartz/ui/prose.css';
	import { afterNavigate, goto } from '$app/navigation';
	import { page } from '$app/state';
	import Menu from '@lucide/svelte/icons/menu';
	import X from '@lucide/svelte/icons/x';
	import {
		assetHref,
		ColorModeToggle,
		Comments,
		count,
		formatDate,
		isoDate,
		LinkPreviews,
		newestFirst,
		noteDate,
		SearchDialog,
		tagHrefFor,
		themeSettings,
		type ThemePageProps
	} from '@svartz/ui';
	import Contents from '../components/Contents.svelte';
	import Infobox from '../components/Infobox.svelte';
	import { wikiRoutes } from '../manifest.js';
	import { featuredNote, readHatnote, readInfobox } from '../wiki.js';

	let { children, entry, vault, site, themeConfig, searchIndex, searchOptions }: ThemePageProps = $props();

	const RECENT_ON_MAIN_PAGE = 6;

	const settings = $derived(themeSettings(themeConfig));
	const prefixes = $derived(wikiRoutes(themeConfig as { routes?: Record<string, string> }));
	const mount = $derived(vault.routes.mountPath);
	const homeHref = $derived(`${mount}/`);
	const tagHref = $derived(tagHrefFor(vault));
	const isMainPage = $derived(entry?.slug === 'index');
	const infobox = $derived(entry ? readInfobox(entry.properties) : undefined);
	// The pipeline publishes attachments named by top-level `image`, so that is the portable field.
	const infoboxImageName = $derived(
		infobox?.image ?? (typeof entry?.properties.image === 'string' ? entry.properties.image : undefined)
	);
	const infoboxImage = $derived(infoboxImageName ? assetHref(vault, infoboxImageName) : undefined);
	const hatnote = $derived(entry ? readHatnote(entry.properties) : undefined);
	const edited = $derived(entry ? noteDate(entry) : undefined);
	const linksHere = $derived(entry ? (vault.note(entry.slug)?.backlinks ?? []) : []);
	const featured = $derived(featuredNote(vault.entries));
	const recent = $derived(newestFirst(vault.entries.filter((note) => note.slug !== 'index')).slice(0, RECENT_ON_MAIN_PAGE));
	const comments = $derived(entry?.page.comments ? settings.comments : undefined);

	const portal = $derived([
		{ label: 'Main page', href: homeHref },
		{ label: 'Recent changes', href: `${mount}/${prefixes.feed}/` },
		{ label: 'All pages', href: `${mount}/${prefixes.folders}/` },
		{ label: 'Categories', href: `${mount}/${prefixes.tags}/` }
	]);

	function randomPage() {
		const candidates = vault.entries.filter((note) => note.href !== page.url.pathname);
		const pick = candidates[Math.floor(Math.random() * candidates.length)];
		if (pick) void goto(pick.href);
	}

	let drawer = $state(false);
	afterNavigate(() => (drawer = false));
</script>

<a class="sv-skip-link" href="#content">Skip to content</a>

<header class="wiki-header">
	<div class="header-inner">
	<button
		class="sv-icon-button menu"
		type="button"
		aria-expanded={drawer}
		aria-controls="wiki-rail"
		aria-label={drawer ? 'Close the menu' : 'Open the menu'}
		onclick={() => (drawer = !drawer)}
	>
		{#if drawer}<X aria-hidden="true" />{:else}<Menu aria-hidden="true" />{/if}
	</button>
	<a class="sv-wordmark" href={homeHref}>{site.title}</a>
	<div class="search"><SearchDialog documents={vault.search} {searchIndex} {searchOptions} /></div>
	<ColorModeToggle />
	</div>
</header>

<div class="wiki">
	<aside class="rail" id="wiki-rail" data-open={drawer ? '' : undefined} aria-label="Site">
		<nav class="portal" aria-labelledby="portal-heading">
			<h2 id="portal-heading" class="sv-section-title">Navigation</h2>
			<ul>
				{#each portal as link (link.href)}
					<li><a href={link.href} aria-current={page.url.pathname === link.href ? 'page' : undefined}>{link.label}</a></li>
				{/each}
				<li><button type="button" onclick={randomPage}>Random page</button></li>
			</ul>
		</nav>
		{#if entry?.page.toc}
			<div class="rail-contents"><Contents items={entry.toc} /></div>
		{/if}
	</aside>

	<main class="main" id="content" tabindex="-1">
		<div data-sv-preview>
			{#if entry}
				<header class="article-head" id="top">
					<h1>{entry.title}</h1>
					<p class="tagline">From {site.title}</p>
				</header>
				{#if hatnote}<p class="hatnote">{hatnote}</p>{/if}
				<article class="sv-prose wiki-prose">
					{#if infobox}<Infobox {infobox} title={entry.title} imageSrc={infoboxImage} entries={vault.entries} />{/if}
					{@render children?.()}
				</article>
			{:else}
				{@render children?.()}
			{/if}
		</div>

		{#if isMainPage}
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
					<a class="more" href="{mount}/{prefixes.feed}/">All recent changes</a>
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
		{/if}

		{#if entry && !isMainPage}
			<footer class="article-foot">
				{#if entry.tags.length > 0}
					<div class="categories">
						<span><a class="categories-label" href="{mount}/{prefixes.tags}/">Categories</a>:</span>
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

		{#if comments}<Comments {...comments} />{/if}

		<footer class="site-foot">
			<p>{site.title}{' · '}Published with <a href="https://github.com/mia-cx/svartz">Svartz</a></p>
			{#if settings.footerLinks.length > 0}
				<ul>
					{#each settings.footerLinks as link (link.href)}<li><a href={link.href}>{link.label}</a></li>{/each}
				</ul>
			{/if}
		</footer>
	</main>
</div>

<LinkPreviews />

<style>
	:global(:root) {
		--sv-density: 0.85;
		--sv-ratio: 1.18;
		--sv-measure: 52rem;
	}

	.wiki-header {
		position: sticky;
		inset-block-start: 0;
		z-index: var(--sv-z-sticky);
		border-block-end: var(--sv-rule-width) solid var(--sv-rule);
		background: var(--sv-paper);
	}

	/* Same columns as the page below: the name over the rail, search over the article. */
	.header-inner {
		display: grid;
		grid-template-columns: 14rem minmax(0, 36rem) 1fr;
		align-items: center;
		column-gap: var(--sv-space-7);
		max-inline-size: 84rem;
		margin-inline: auto;
		padding: var(--sv-space-3) var(--sv-space-5);
	}

	.header-inner > :global(.sv-color-mode) {
		justify-self: end;
	}

	.wiki-header .sv-wordmark {
		font-size: var(--sv-step-1);
		white-space: nowrap;
	}

	.search {
		display: flex;
		min-inline-size: 0;
	}

	.search :global(.sv-search-trigger) {
		flex: 1;
	}

	.menu {
		display: none;
	}

	.wiki {
		display: grid;
		grid-template-columns: 14rem minmax(0, 1fr);
		column-gap: var(--sv-space-7);
		max-inline-size: 84rem;
		margin-inline: auto;
		padding-inline: var(--sv-space-5);
	}

	.rail {
		position: sticky;
		inset-block-start: 4rem;
		display: grid;
		align-content: start;
		gap: var(--sv-space-6);
		max-block-size: calc(100dvh - 4rem);
		padding-block: var(--sv-space-6);
		overflow-y: auto;
		scrollbar-width: thin;
		align-self: start;
	}

	.portal ul {
		display: grid;
		gap: var(--sv-space-1);
		margin: var(--sv-space-2) 0 0;
		padding: 0;
		list-style: none;
		font-size: var(--sv-step--1);
	}

	.portal a,
	.portal button {
		padding: 0;
		border: 0;
		background: none;
		color: var(--sv-text);
		font: inherit;
		text-decoration: none;
		cursor: pointer;
	}

	.portal a:hover,
	.portal button:hover {
		color: var(--sv-accent-text);
	}

	.portal a[aria-current] {
		color: var(--sv-ink);
		font-weight: 600;
	}

	.main {
		min-inline-size: 0;
		padding-block: var(--sv-space-6) var(--sv-space-7);
		container: wiki-article / inline-size;
		outline: none;
	}

	.article-head {
		margin-block-end: var(--sv-space-3);
		padding-block-end: var(--sv-space-2);
		border-block-end: var(--sv-rule-width) solid var(--sv-rule-strong);
	}

	.article-head h1 {
		margin: 0;
		color: var(--sv-ink);
		font-size: var(--sv-step-5);
		font-weight: 700;
		letter-spacing: -0.02em;
		line-height: 1.1;
	}

	.tagline {
		margin: var(--sv-space-2) 0 0;
		color: var(--sv-muted);
		font-size: var(--sv-step--1);
	}

	.hatnote {
		margin: 0 0 var(--sv-space-4);
		padding-inline-start: var(--sv-space-5);
		color: var(--sv-text);
		font-style: italic;
	}

	.wiki-prose {
		max-inline-size: none;
	}

	/* Wikipedia sections: a rule under each second-level heading. */
	/* Boxed blocks stay beside a floated infobox instead of running under it. */
	.wiki-prose :global(:is(.sv-callout, .sv-code, .svartz-embed)) {
		overflow: hidden;
	}

	/* flow-root keeps the heading (and its rule) beside a floated infobox, not under it. */
	.wiki-prose :global(h2) {
		display: flow-root;
		padding-block-end: var(--sv-space-1);
		border-block-end: var(--sv-rule-width) solid var(--sv-rule);
	}

	.wiki-prose :global(.footnotes)::before {
		content: 'References';
		display: block;
		margin-block-end: var(--sv-space-2);
		color: var(--sv-ink);
		font-size: var(--sv-step-3);
		font-weight: 700;
	}

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
	.category-pills,
	.links-here ul,
	.site-foot ul {
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

	.recent a,
	.links-here a {
		color: var(--sv-ink);
		text-decoration: none;
	}

	.recent a:hover,
	.links-here a:hover {
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
		margin-block-start: var(--sv-space-2);
		font-size: var(--sv-step--1);
	}

	.edited {
		margin: 0;
		color: var(--sv-muted);
		font-size: var(--sv-step--1);
	}

	.site-foot {
		display: flex;
		flex-wrap: wrap;
		justify-content: space-between;
		gap: var(--sv-space-2);
		margin-block-start: var(--sv-space-7);
		padding-block-start: var(--sv-space-4);
		border-block-start: var(--sv-rule-width) solid var(--sv-rule);
		color: var(--sv-muted);
		font-size: var(--sv-step--1);
	}

	.site-foot p {
		margin: 0;
	}

	.site-foot ul {
		display: flex;
		gap: var(--sv-space-4);
	}

	.site-foot a {
		color: var(--sv-text);
	}

	/* Phone and tablet: the rail becomes a drawer under the header. */
	@media (max-width: 56rem) {
		.menu {
			display: inline-grid;
		}

		.header-inner {
			display: flex;
			gap: var(--sv-space-2);
			padding-inline: var(--sv-space-3);
		}

		.search {
			flex: 1;
		}

		.header-inner > :global(.sv-color-mode) {
			margin-inline-start: auto;
		}

		.wiki {
			grid-template-columns: minmax(0, 1fr);
			padding-inline: var(--sv-space-4);
		}

		.rail {
			position: fixed;
			inset: 3.5rem 0 0;
			align-self: stretch;
			z-index: var(--sv-z-drawer);
			max-block-size: none;
			padding: var(--sv-space-5);
			background: var(--sv-paper);
			translate: -100% 0;
			visibility: hidden;
			transition:
				translate var(--sv-duration-slow) var(--sv-ease),
				visibility 0s linear var(--sv-duration-slow);
		}

		.rail[data-open] {
			translate: 0 0;
			visibility: visible;
			transition: translate var(--sv-duration-slow) var(--sv-ease);
		}
	}

	@media (max-width: 40rem) {
		.wiki-header .sv-wordmark {
			overflow: hidden;
			text-overflow: ellipsis;
		}

		.search {
			flex: none;
		}

		.search :global(.sv-search-trigger-label),
		.search :global(.sv-search-trigger-keys) {
			display: none;
		}
	}
</style>
