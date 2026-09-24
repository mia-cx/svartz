<!--
	Package reference docs: a top bar with the package name, version, and search;
	the reference sidebar; the page; and "On this page". Symbol notes get a kind
	badge, signatures, parameter tables, and members from their frontmatter.
-->
<script lang="ts">
	import '@svartz/ui/base.css';
	import '@svartz/ui/prose.css';
	import { afterNavigate } from '$app/navigation';
	import { page } from '$app/state';
	import Menu from '@lucide/svelte/icons/menu';
	import X from '@lucide/svelte/icons/x';
	import {
		ColorModeToggle,
		Comments,
		count,
		formatDate,
		isoDate,
		LinkPreviews,
		noteDate,
		pageCrumbs,
		SearchDialog,
		themeSettings,
		type ThemePageProps
	} from '@svartz/ui';
	import DocsNav from '../components/DocsNav.svelte';
	import KindBadge from '../components/KindBadge.svelte';
	import OnThisPage from '../components/OnThisPage.svelte';
	import SymbolReference from '../components/SymbolReference.svelte';
	import { readSymbol, symbolNav, symbolToc } from '../symbols.js';

	let { children, entry, vault, site, match, themeConfig, searchIndex, searchOptions }: ThemePageProps = $props();

	const settings = $derived(themeSettings(themeConfig));
	const version = $derived(typeof themeConfig?.version === 'string' ? themeConfig.version : undefined);
	const homeHref = $derived(`${vault.routes.mountPath}/`);
	const symbol = $derived(entry ? readSymbol(entry.properties) : undefined);
	const toc = $derived(entry ? (symbol ? symbolToc(symbol, entry.toc) : entry.page.toc ? entry.toc : []) : []);
	const crumbs = $derived(pageCrumbs(vault, entry, match).slice(0, -1));
	const updated = $derived(entry ? noteDate(entry) : undefined);
	const isHome = $derived(entry?.slug === 'index');
	const modules = $derived(symbolNav(vault.entries, vault.folders));
	const comments = $derived(entry?.page.comments ? settings.comments : undefined);

	let drawer = $state(false);
	afterNavigate(() => (drawer = false));
</script>

<a class="sv-skip-link" href="#content">Skip to content</a>

<header class="top-bar">
	<button
		class="sv-icon-button menu"
		type="button"
		aria-expanded={drawer}
		aria-controls="docs-sidebar"
		aria-label={drawer ? 'Close the reference' : 'Open the reference'}
		onclick={() => (drawer = !drawer)}
	>
		{#if drawer}<X aria-hidden="true" />{:else}<Menu aria-hidden="true" />{/if}
	</button>
	<a class="sv-wordmark" href={homeHref}>{site.title}</a>
	{#if version}<span class="sv-badge version" data-sv-signal style:--sv-hue="var(--sv-hue-green)">v{version}</span>{/if}
	<div class="search"><SearchDialog documents={vault.search} {searchIndex} {searchOptions} /></div>
	{#if settings.navLinks.length > 0}
		<nav class="top-links" aria-label="Project">
			{#each settings.navLinks as link (link.href)}<a href={link.href}>{link.label}</a>{/each}
		</nav>
	{/if}
	<ColorModeToggle />
</header>

<div class="docs">
	<aside class="sidebar" id="docs-sidebar" data-open={drawer ? '' : undefined}>
		<DocsNav entries={vault.entries} folders={vault.folders} currentHref={page.url.pathname} />
	</aside>

	<main class="content" id="content" tabindex="-1">
		{#if crumbs.length > 0}
			<nav class="crumbs" aria-label="Breadcrumbs">
				{#each crumbs as crumb, index (crumb.href)}{#if index > 0}<span aria-hidden="true">/</span>{/if}<a href={crumb.href}>{crumb.title}</a>{/each}
			</nav>
		{/if}
		<div data-sv-preview>
			{#if entry}
				<header class="page-head">
					{#if symbol}
						<div class="symbol-title">
							<KindBadge kind={symbol.kind} />
							<h1 class="symbol-name">{symbol.name}</h1>
							{#if symbol.since}<span class="sv-label">Since {symbol.since}</span>{/if}
						</div>
						{#if entry.description}<p class="summary">{entry.description}</p>{/if}
					{:else}
						<h1>{entry.title}</h1>
						{#if entry.description}<p class="summary">{entry.description}</p>{/if}
					{/if}
				</header>
				{#if symbol}
					<SymbolReference {symbol} entries={vault.entries}>
						<div class="sv-prose note-body">{@render children?.()}</div>
					</SymbolReference>
				{:else}
					<article class="sv-prose note-body">{@render children?.()}</article>
				{/if}
			{:else}
				{@render children?.()}
			{/if}
		</div>

		{#if isHome}
			<section class="modules" aria-labelledby="modules-heading">
				<h2 id="modules-heading" class="sv-section-title">Browse the reference</h2>
				<ul>
					{#each modules as section (section.slug)}
						<li>
							{#if section.href}<a href={section.href} class:mono={section.symbols}>{section.title}</a>{:else}<span>{section.title}</span>{/if}
							<span class="sv-label">{count(section.entries.length, section.symbols ? 'symbol' : 'page')}</span>
						</li>
					{/each}
				</ul>
			</section>
		{/if}

		{#if comments}<Comments {...comments} />{/if}

		<footer class="page-foot">
			{#if updated && entry}<p>Last updated <time datetime={isoDate(updated)}>{formatDate(updated)}</time></p>{/if}
			<p>{site.title}{' · '}Published with <a href="https://github.com/mia-cx/svartz">Svartz</a></p>
		</footer>
	</main>

	<aside class="rail" aria-label="On this page">
		<OnThisPage items={toc} />
	</aside>
</div>

<LinkPreviews />

<style>
	:global(:root) {
		--sv-density: 0.9;
		--sv-ratio: 1.17;
		--sv-measure: 48rem;
	}

	.top-bar {
		position: sticky;
		inset-block-start: 0;
		z-index: var(--sv-z-sticky);
		display: flex;
		align-items: center;
		gap: var(--sv-space-3);
		block-size: 3.5rem;
		padding-inline: var(--sv-space-5);
		border-block-end: var(--sv-rule-width) solid var(--sv-rule);
		background: var(--sv-paper);
	}

	.top-bar .sv-wordmark {
		font-size: var(--sv-step-1);
		white-space: nowrap;
	}

	.search {
		flex: 1;
		display: flex;
		justify-content: center;
		min-inline-size: 0;
	}

	.search :global(.sv-search-trigger) {
		inline-size: min(28rem, 100%);
	}

	.top-links {
		display: flex;
		gap: var(--sv-space-4);
		font-size: var(--sv-step--1);
	}

	.top-links a {
		color: var(--sv-text);
		font-weight: 600;
		text-decoration: none;
	}

	.top-links a:hover {
		color: var(--sv-accent-text);
	}

	.menu {
		display: none;
	}

	.docs {
		display: grid;
		grid-template-columns: 16rem minmax(0, 1fr) 13rem;
		column-gap: var(--sv-space-7);
		max-inline-size: 90rem;
		margin-inline: auto;
		padding-inline: var(--sv-space-5);
	}

	.sidebar,
	.rail {
		position: sticky;
		inset-block-start: 3.5rem;
		align-self: start;
		max-block-size: calc(100dvh - 3.5rem);
		padding-block: var(--sv-space-6);
		overflow-y: auto;
		scrollbar-width: thin;
	}

	.content {
		min-inline-size: 0;
		max-inline-size: var(--sv-measure);
		padding-block: var(--sv-space-6) var(--sv-space-7);
		outline: none;
	}

	.crumbs {
		display: flex;
		flex-wrap: wrap;
		gap: var(--sv-space-2);
		margin-block-end: var(--sv-space-3);
		font-size: var(--sv-step--1);
	}

	.crumbs a {
		color: var(--sv-muted);
		text-decoration: none;
	}

	.crumbs a:hover {
		color: var(--sv-accent-text);
	}

	.crumbs span {
		color: var(--sv-rule-strong);
	}

	.page-head {
		margin-block-end: var(--sv-space-5);
	}

	.page-head h1 {
		margin: 0;
		color: var(--sv-ink);
		font-size: var(--sv-step-4);
		font-weight: 700;
		letter-spacing: -0.02em;
		line-height: 1.1;
	}

	.symbol-title {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--sv-space-3);
	}

	.page-head .symbol-name {
		font-family: var(--sv-font-mono);
		font-size: var(--sv-step-3);
		letter-spacing: 0;
		overflow-wrap: anywhere;
	}

	.summary {
		margin: var(--sv-space-3) 0 0;
		color: var(--sv-text);
		font-size: var(--sv-step-1);
	}

	.note-body {
		max-inline-size: none;
		margin-block-start: var(--sv-space-5);
	}

	.modules {
		margin-block-start: var(--sv-space-7);
	}

	.modules ul {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(14rem, 1fr));
		gap: var(--sv-space-3);
		margin: var(--sv-space-3) 0 0;
		padding: 0;
		list-style: none;
	}

	.modules li {
		position: relative;
		display: grid;
		gap: var(--sv-space-1);
		padding: var(--sv-space-4);
		border: var(--sv-rule-width) solid var(--sv-rule);
		border-radius: var(--sv-radius-m);
	}

	.modules li:hover {
		border-color: var(--sv-ink);
	}

	.modules a {
		color: var(--sv-ink);
		font-weight: 700;
		text-decoration: none;
	}

	.modules a.mono {
		font-family: var(--sv-font-mono);
		font-weight: 600;
	}

	.modules a::after {
		content: '';
		position: absolute;
		inset: 0;
	}

	.page-foot {
		display: flex;
		flex-wrap: wrap;
		justify-content: space-between;
		gap: var(--sv-space-2);
		margin-block-start: var(--sv-space-8);
		padding-block-start: var(--sv-space-4);
		border-block-start: var(--sv-rule-width) solid var(--sv-rule);
		color: var(--sv-muted);
		font-size: var(--sv-step--1);
	}

	.page-foot p {
		margin: 0;
	}

	.page-foot a {
		color: var(--sv-text);
	}

	@media (max-width: 72rem) {
		.docs {
			grid-template-columns: 15rem minmax(0, 1fr);
		}

		.rail {
			display: none;
		}
	}

	@media (max-width: 52rem) {
		.menu {
			display: inline-grid;
		}

		.top-bar {
			padding-inline: var(--sv-space-3);
		}

		.version,
		.top-links {
			display: none;
		}

		.search {
			flex: none;
			margin-inline-start: auto;
		}

		.search :global(.sv-search-trigger) {
			inline-size: 2.25rem;
			padding: 0;
			justify-content: center;
		}

		.search :global(.sv-search-trigger-label),
		.search :global(.sv-search-trigger-keys) {
			display: none;
		}

		.docs {
			grid-template-columns: minmax(0, 1fr);
			padding-inline: var(--sv-space-4);
		}

		.sidebar {
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

		.sidebar[data-open] {
			translate: 0 0;
			visibility: visible;
			transition: translate var(--sv-duration-slow) var(--sv-ease);
		}
	}
</style>
