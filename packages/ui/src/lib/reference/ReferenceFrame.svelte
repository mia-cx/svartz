<!--
	The reference frame for theme-minimal's shell: a top bar, the explorer in a
	sidebar, and the page with its right column beside it: as wide as the
	sidebar for contents, wider for code examples. Examples drop below the page before the sidebar goes; on phones
	the sidebar becomes a drawer. It only lays out the regions minimal renders.
-->
<script lang="ts">
	import type { Snippet } from 'svelte';
	import { getVaultHomes } from '../site-routes.js';
	import { themeSettings } from '../theme-settings.js';
	import VersionNotice from './VersionNotice.svelte';
	import { versionLinks } from './versions.js';

	let {
		shell,
		header,
		navigation,
		pageHead,
		body,
		aside,
		pageFoot,
		footer
	}: {
		shell: {
			readonly drawer: boolean;
			readonly homeHref: string;
			readonly currentHref?: string;
			readonly themeConfig?: Readonly<Record<string, unknown>>;
		};
		header: Snippet;
		navigation: Snippet;
		pageHead: Snippet;
		body: Snippet;
		aside: Snippet;
		pageFoot: Snippet;
		footer: Snippet;
	} = $props();

	const navLinks = $derived(themeSettings(shell.themeConfig ?? {}).navLinks);
	const homeOf = getVaultHomes();
	const versions = $derived(
		versionLinks(shell.themeConfig ?? {}, { homeHref: shell.homeHref, currentHref: shell.currentHref ?? shell.homeHref, homeOf })
	);
</script>

{@render header()}

<div class="frame">
	<aside class="sidebar" id="explorer-panel" aria-label="Pages" data-open={shell.drawer ? '' : undefined}>
		<!-- The top bar's project links, which phones hide there, lead the drawer. -->
		{#if navLinks.length > 0}
			<nav class="drawer-links" aria-label="Project">
				{#each navLinks as link (link.label)}<a href={link.href}>{link.label}</a>{/each}
			</nav>
		{/if}
		{@render navigation()}
	</aside>

	<main class="main" id="content" tabindex="-1" inert={shell.drawer}>
		<div class="split">
			<div class="page">
				<VersionNotice {versions} />
				<div data-sv-preview>{@render pageHead()}{@render body()}</div>
				{@render pageFoot()}
			</div>
			<aside class="aside" aria-label="Beside the page">{@render aside()}</aside>
		</div>
		{@render footer()}
	</main>
</div>

<style>
	:global(:root) {
		--sv-density: 0.85;
		--sv-ratio: 1.15;
		--sv-measure: 44rem;
		/* The right column's narrowest width, which the top bar also reserves so search spans the page column. */
		--sv-rail-min: var(--sv-side-width);
	}

	:global(:root:has(.sv-reference-examples)) {
		--sv-rail-min: 20rem;
	}

	.frame {
		display: grid;
		grid-template-columns: var(--sv-side-width) minmax(0, 1fr);
		column-gap: var(--sv-space-7);
		max-inline-size: var(--sv-frame-width);
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

	.drawer-links {
		display: none;
	}

	.main {
		min-inline-size: 0;
		padding-block: var(--sv-space-6) 0;
		outline: none;
	}

	.split {
		/* Contents match the sidebar's width and sit at the frame's far edge, so the columns balance. */
		--rail: var(--sv-rail-min);
		display: grid;
		grid-template-columns: minmax(0, var(--sv-measure)) var(--rail);
		justify-content: space-between;
		gap: var(--sv-space-7);
		align-items: start;
	}

	/* Code examples need room: the page keeps its reading width, and they fill the rest up to the frame's edge. */
	.split:has(> .aside :global(.sv-reference-examples)) {
		--rail: minmax(var(--sv-rail-min), 1fr);
	}

	/* Nothing beside the page: it keeps the reading width alone. */
	.split:has(> .aside:not(:has(*))) {
		grid-template-columns: minmax(0, var(--sv-measure));
	}

	.split:has(> .aside:not(:has(*))) > .aside {
		display: none;
	}

	.page {
		min-inline-size: 0;
	}

	.aside {
		position: sticky;
		inset-block-start: calc(3.5rem + var(--sv-space-5));
		min-inline-size: 0;
		max-block-size: calc(100dvh - 3.5rem - 2 * var(--sv-space-5));
		overflow-y: auto;
		scrollbar-width: thin;
	}

	.main > :global(:last-child) {
		max-inline-size: var(--sv-measure);
		margin-block-start: var(--sv-space-8);
	}

	@media (max-width: 75rem) {
		.split {
			grid-template-columns: minmax(0, var(--sv-measure));
		}

		.aside {
			position: static;
			max-block-size: none;
		}

		/* Contents only help beside the page. */
		.aside :global(.toc) {
			display: none;
		}
	}

	@media (max-width: 50rem) {
		.frame {
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

		.drawer-links {
			display: flex;
			flex-wrap: wrap;
			gap: var(--sv-space-2) var(--sv-space-4);
			margin-block-end: var(--sv-space-5);
			padding-block-end: var(--sv-space-4);
			border-block-end: var(--sv-rule-width) solid var(--sv-rule);
			font-weight: 600;
		}

		.drawer-links a {
			color: var(--sv-text);
			text-decoration: none;
		}

		.drawer-links a:hover {
			color: var(--sv-ink);
		}
	}
</style>
