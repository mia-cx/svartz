<!--
	API docs: a top bar, the resource sidebar, and for operations and models a
	two-column page with the reference on the left and sticky examples on the
	right. Guides and list pages use a single reading column.
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
		count,
		DescText,
		LinkPreviews,
		SearchDialog,
		themeSettings,
		type ThemePageProps
	} from '@svartz/ui';
	import ApiNav from '../components/ApiNav.svelte';
	import CodePanel from '../components/CodePanel.svelte';
	import Examples from '../components/Examples.svelte';
	import OperationDoc from '../components/OperationDoc.svelte';
	import SchemaTree from '../components/SchemaTree.svelte';
	import { apiNav, exampleFromSchema, modelSchemas, readModel, readOperation } from '../api.js';

	let { children, entry, vault, site, themeConfig, searchIndex, searchOptions }: ThemePageProps = $props();

	const settings = $derived(themeSettings(themeConfig));
	const setting = (key: string) => (typeof themeConfig?.[key] === 'string' ? (themeConfig[key] as string) : undefined);
	const baseUrl = $derived(setting('baseUrl') ?? 'https://api.example.com');
	const graphqlEndpoint = $derived(setting('graphqlEndpoint') ?? `${baseUrl}/graphql`);
	const version = $derived(setting('version'));
	const homeHref = $derived(`${vault.routes.mountPath}/`);
	const models = $derived(modelSchemas(vault.entries));
	const modelHref = $derived((name: string) => vault.entries.find((note) => readModel(note.properties)?.name === name)?.href);
	const operation = $derived(entry ? readOperation(entry.properties) : undefined);
	const model = $derived(entry ? readModel(entry.properties) : undefined);
	const sections = $derived(apiNav(vault.entries, vault.folders));

	let drawer = $state(false);
	afterNavigate(() => (drawer = false));
</script>

<a class="sv-skip-link" href="#content">Skip to content</a>

<header class="top-bar">
	<button
		class="sv-icon-button menu"
		type="button"
		aria-expanded={drawer}
		aria-controls="api-sidebar"
		aria-label={drawer ? 'Close the reference' : 'Open the reference'}
		onclick={() => (drawer = !drawer)}
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

<div class="api">
	<aside class="sidebar" id="api-sidebar" data-open={drawer ? '' : undefined}>
		<ApiNav entries={vault.entries} folders={vault.folders} currentHref={page.url.pathname} />
	</aside>

	<main class="main" id="content" tabindex="-1">
		{#if entry && operation}
			<div class="split">
				<div class="reference" data-sv-preview>
					<OperationDoc {operation} title={entry.title} {modelHref} entries={vault.entries}>
						{#if entry.description}<p class="summary"><DescText value={entry.description} entries={vault.entries} /></p>{/if}
						<div class="sv-prose note-body">{@render children?.()}</div>
					</OperationDoc>
				</div>
				<aside class="examples" aria-label="Examples">
					<Examples {operation} {baseUrl} {graphqlEndpoint} {models} />
				</aside>
			</div>
		{:else if entry && model}
			<div class="split">
				<div class="reference" data-sv-preview>
					<header class="head">
						<p class="sv-label">Model</p>
						<h1>The <code>{model.name}</code> object</h1>
						{#if entry.description}<p class="summary"><DescText value={entry.description} entries={vault.entries} /></p>{/if}
					</header>
					<div class="sv-prose note-body">{@render children?.()}</div>
					<section aria-labelledby="attributes">
						<h2 id="attributes" class="attributes">Attributes</h2>
						<SchemaTree schema={model.schema} {modelHref} entries={vault.entries} />
					</section>
				</div>
				<aside class="examples" aria-label="Example">
					<CodePanel title="Example" tabs={[{ id: 'json', label: model.name, code: JSON.stringify(exampleFromSchema(model.schema, models), null, 2) }]} />
				</aside>
			</div>
		{:else if entry}
			<article class="single" data-sv-preview>
				<header class="head">
					<h1>{entry.title}</h1>
					{#if entry.description}<p class="summary"><DescText value={entry.description} entries={vault.entries} /></p>{/if}
				</header>
				<div class="sv-prose note-body">{@render children?.()}</div>
				{#if entry.slug === 'index'}
					<section class="resources" aria-labelledby="resources-heading">
						<h2 id="resources-heading" class="sv-section-title">Resources</h2>
						<ul>
							{#each sections.filter((section) => section.reference) as section (section.slug)}
								<li>
									{#if section.href}<a href={section.href}>{section.title}</a>{:else}<span>{section.title}</span>{/if}
									<span class="sv-label">{count(section.entries.length, 'page')}</span>
								</li>
							{/each}
						</ul>
					</section>
				{/if}
			</article>
		{:else}
			<div class="single">{@render children?.()}</div>
		{/if}

		<footer class="page-foot">
			<p>{site.title}{' · '}Published with <a href="https://github.com/mia-cx/svartz">Svartz</a></p>
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

	.menu {
		display: none;
	}

	.api {
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

	.examples {
		position: sticky;
		inset-block-start: calc(3.5rem + var(--sv-space-5));
		max-block-size: calc(100dvh - 3.5rem - 2 * var(--sv-space-5));
		overflow-y: auto;
	}

	.single {
		max-inline-size: var(--sv-measure);
	}

	.head {
		margin-block-end: var(--sv-space-5);
	}

	.head .sv-label {
		margin: 0 0 var(--sv-space-1);
	}

	.head h1 {
		margin: 0;
		color: var(--sv-ink);
		font-size: var(--sv-step-4);
		font-weight: 700;
		line-height: 1.1;
	}

	.head h1 code {
		font-family: var(--sv-font-mono);
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

	.attributes {
		margin: var(--sv-space-6) 0 var(--sv-space-2);
		padding-block-end: var(--sv-space-1);
		border-block-end: var(--sv-rule-width) solid var(--sv-rule-strong);
		color: var(--sv-ink);
		font-size: var(--sv-step-1);
		font-weight: 700;
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

		.api {
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
