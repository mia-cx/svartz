<!--
	The reference shell every reference theme shares: a top bar with search,
	the filterable sidebar, and the page. A page whose metadata selects a
	renderer gets the reference column, with that renderer's examples beside it
	on wide screens and below it on narrow ones. Other pages read as guides.
	Reference pages leave out graphs, backlinks, dates, and reading times.
-->
<script lang="ts">
	import '../styles/base.css';
	import '../styles/prose.css';
	import { afterNavigate } from '$app/navigation';
	import { page } from '$app/state';
	import Menu from '@lucide/svelte/icons/menu';
	import X from '@lucide/svelte/icons/x';
	import { tick } from 'svelte';
	import ColorModeToggle from '../ColorModeToggle.svelte';
	import Comments from '../Comments.svelte';
	import DescText from '../DescText.svelte';
	import LinkPreviews from '../LinkPreviews.svelte';
	import PageActions from '../PageActions.svelte';
	import SearchDialog from '../SearchDialog.svelte';
	import { count } from '../listing.js';
	import type { ThemePageProps } from '../runtime/theme-props.js';
	import { themeSettings } from '../theme-settings.js';
	import { setReferenceShell } from './context.js';
	import { readSources } from './metadata.js';
	import { navLinks, referenceNav } from './nav.js';
	import ReferenceNav from './ReferenceNav.svelte';
	import { referencePage, SCHEMA_RENDERER, themeRegistry, type ReferenceContext } from './renderers.js';
	import type { SchemaNode } from './schema.js';
	import SourceLinks from './SourceLinks.svelte';

	let { children, entry, vault, site, themeConfig, searchIndex, searchOptions, theme }: ThemePageProps = $props();

	const config = $derived(themeConfig ?? {});
	const settings = $derived(themeSettings(config));
	const version = $derived(typeof config.version === 'string' ? config.version : undefined);
	const homeHref = $derived(`${vault.routes.mountPath}/`);
	const registry = $derived(themeRegistry(theme));

	// One pass over the vault: every page's renderer and data. A page with bad metadata fails here, by name.
	const pages = $derived(new Map(vault.entries.map((note) => [note, referencePage(registry, note)])));
	const itemOf = (note: (typeof vault.entries)[number]) => {
		const selected = pages.get(note);
		return selected && selected.renderer.nav(selected.data, note);
	};
	const sections = $derived(referenceNav(vault.entries, vault.folders, itemOf));
	const schemaPages = $derived(
		[...pages].flatMap(([note, selected]) =>
			selected?.renderer.id === SCHEMA_RENDERER ? [{ note, schema: selected.data as { name: string; schema: SchemaNode } }] : []
		)
	);
	const schemas = $derived(Object.fromEntries(schemaPages.map(({ schema }) => [schema.name, schema.schema])));
	const schemaHref = $derived((name: string) => schemaPages.find(({ schema }) => schema.name === name)?.note.href);

	const selected = $derived(entry ? (pages.get(entry) ?? referencePage(registry, entry)) : undefined);
	const context = $derived<ReferenceContext | undefined>(
		entry && { entry, vault, themeConfig: config, schemas, schemaHref }
	);
	const sources = $derived(entry ? readSources(entry.properties) : []);
	const comments = $derived(entry?.page.comments ? settings.comments : undefined);

	setReferenceShell({
		get registry() {
			return registry;
		},
		get sections() {
			return sections;
		},
		itemOf
	});

	let drawer = $state(false);
	let menuButton: HTMLButtonElement | undefined = $state();
	let filterInput: HTMLInputElement | undefined = $state();
	afterNavigate(() => (drawer = false));

	async function toggleDrawer() {
		drawer = !drawer;
		await tick();
		if (drawer) filterInput?.focus();
	}

	function onkeydown(event: KeyboardEvent) {
		if (event.key !== 'Escape' || !drawer) return;
		drawer = false;
		menuButton?.focus();
	}
</script>

<svelte:window {onkeydown} />

<a class="sv-skip-link" href="#content">Skip to content</a>

<header class="top-bar">
	<button
		bind:this={menuButton}
		class="sv-icon-button menu"
		type="button"
		aria-expanded={drawer}
		aria-controls="sv-reference-sidebar"
		aria-label={drawer ? 'Close the page list' : 'Open the page list'}
		onclick={toggleDrawer}
	>
		{#if drawer}<X aria-hidden="true" />{:else}<Menu aria-hidden="true" />{/if}
	</button>
	<a class="sv-wordmark" href={homeHref}>{site.title}</a>
	{#if version}<span class="sv-badge version" data-sv-signal style:--sv-hue="var(--sv-hue-green)">{version}</span>{/if}
	<div class="search"><SearchDialog documents={vault.search} {searchIndex} {searchOptions} /></div>
	{#if settings.navLinks.length > 0}
		<nav class="top-links" aria-label="Project">
			{#each settings.navLinks as link (link.href)}<a href={link.href}>{link.label}</a>{/each}
		</nav>
	{/if}
	<ColorModeToggle />
</header>

<div class="shell">
	<aside class="sidebar" id="sv-reference-sidebar" data-open={drawer ? '' : undefined}>
		<ReferenceNav {sections} currentHref={page.url.pathname} bind:filterInput />
	</aside>

	<main class="main" id="content" tabindex="-1" inert={drawer}>
		{#snippet intro()}
			{#if entry?.description}<p class="summary"><DescText value={entry.description} entries={vault.entries} /></p>{/if}
			{#if entry?.markdownHref}<PageActions href={entry.markdownHref} />{/if}
			<div class="sv-prose note-body">{@render children?.()}</div>
		{/snippet}

		{#if entry && selected && context}
			{@const Page = selected.renderer.page}
			{@const Examples = selected.renderer.examples}
			<div class="split" class:solo={!Examples}>
				<article class="reference" data-sv-preview>
					<Page data={selected.data} {context}>{@render intro()}</Page>
					{#if sources.length > 0}<SourceLinks {sources} />{/if}
				</article>
				{#if Examples}
					<aside class="examples" aria-label="Examples">
						<Examples data={selected.data} {context} />
					</aside>
				{/if}
			</div>
		{:else if entry}
			<article class="single" data-sv-preview>
				<header class="head">
					<h1>{entry.title}</h1>
					{#if entry.description}<p class="summary"><DescText value={entry.description} entries={vault.entries} /></p>{/if}
					{#if entry.markdownHref}<PageActions href={entry.markdownHref} />{/if}
				</header>
				<div class="sv-prose note-body">{@render children?.()}</div>
				{#if sources.length > 0}<SourceLinks {sources} />{/if}
				{#if entry.slug === 'index'}
					<section class="resources" aria-labelledby="resources-heading">
						<h2 id="resources-heading" class="sv-section-title">Reference</h2>
						<ul>
							{#each sections.filter((section) => section.reference) as section (section.slug)}
								<li>
									{#if section.href}<a href={section.href}>{section.title}</a>{:else}<span>{section.title}</span>{/if}
									<span class="sv-label">{count(navLinks([section]).length, 'page')}</span>
								</li>
							{/each}
						</ul>
					</section>
				{/if}
			</article>
		{:else}
			<div class="single">{@render children?.()}</div>
		{/if}

		{#if comments}<div class="single"><Comments {...comments} /></div>{/if}

		<footer class="page-foot">
			<p>
				{site.title}
				{#each settings.footerLinks as link (link.href)}{' · '}<a href={link.href}>{link.label}</a>{/each}
				{' · '}Published with <a href="https://github.com/mia-cx/svartz">Svartz</a>
			</p>
		</footer>
	</main>
</div>

<LinkPreviews />

<style>
	:global(:root) {
		--sv-density: 0.85;
		--sv-ratio: 1.15;
		--sv-measure: 44rem;
	}

	.top-bar {
		position: sticky;
		inset-block-start: 0;
		z-index: var(--sv-z-sticky);
		display: flex;
		align-items: center;
		gap: var(--sv-space-3);
		block-size: 3.5rem;
		/* Edges line up with the centred page below on wide screens. */
		padding-inline: max(var(--sv-space-5), (100% - 100rem) / 2 + var(--sv-space-5));
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
		color: var(--sv-ink);
	}

	.menu {
		display: none;
	}

	.shell {
		display: grid;
		grid-template-columns: 16rem minmax(0, 1fr);
		column-gap: var(--sv-space-7);
		max-inline-size: 100rem;
		margin-inline: auto;
		padding-inline: var(--sv-space-5);
	}

	.sidebar {
		position: sticky;
		inset-block-start: 3.5rem;
		align-self: start;
		max-block-size: calc(100dvh - 3.5rem);
		padding-block: var(--sv-space-6);
		overflow-y: auto;
		overscroll-behavior: contain;
		scrollbar-width: thin;
	}

	.main {
		min-inline-size: 0;
		padding-block: var(--sv-space-6) var(--sv-space-7);
		outline: none;
	}

	.split {
		display: grid;
		/* The examples yield first: a share of the width, clamped, and the reference takes the rest. */
		grid-template-columns: minmax(0, var(--sv-measure)) clamp(20rem, 35%, 34rem);
		gap: var(--sv-space-7);
		align-items: start;
	}

	.split.solo {
		grid-template-columns: minmax(0, var(--sv-measure));
	}

	.reference {
		min-inline-size: 0;
	}

	.examples {
		position: sticky;
		inset-block-start: calc(3.5rem + var(--sv-space-5));
		min-inline-size: 0;
		max-block-size: calc(100dvh - 3.5rem - 2 * var(--sv-space-5));
		overflow-y: auto;
		scrollbar-width: thin;
	}

	.single {
		max-inline-size: var(--sv-measure);
	}

	.head {
		margin-block-end: var(--sv-space-5);
	}

	.head h1 {
		margin: 0;
		color: var(--sv-ink);
		font-size: var(--sv-step-4);
		font-weight: 700;
		line-height: 1.1;
	}

	.summary {
		margin: var(--sv-space-3) 0 0;
		color: var(--sv-text);
		font-size: var(--sv-step-1);
	}

	.note-body {
		max-inline-size: none;
		margin-block-start: var(--sv-space-4);
	}

	.note-body:empty {
		display: none;
	}

	.resources {
		margin-block-start: var(--sv-space-6);
	}

	.resources ul {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(12rem, 1fr));
		gap: var(--sv-space-3);
		margin: var(--sv-space-3) 0 0;
		padding: 0;
		list-style: none;
	}

	.resources li {
		position: relative;
		display: grid;
		gap: var(--sv-space-1);
		padding: var(--sv-space-4);
		border: var(--sv-rule-width) solid var(--sv-rule);
		border-radius: var(--sv-radius-m);
	}

	.resources li:hover {
		border-color: var(--sv-ink);
	}

	.resources a {
		color: var(--sv-ink);
		font-weight: 700;
		text-decoration: none;
	}

	.resources a::after {
		content: '';
		position: absolute;
		inset: 0;
	}

	.page-foot {
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

	/* Examples drop below the reference before the sidebar goes; both keep the reading width. */
	@media (max-width: 72rem) {
		.split {
			grid-template-columns: minmax(0, var(--sv-measure));
		}

		.examples {
			position: static;
			max-block-size: none;
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

		.shell {
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
