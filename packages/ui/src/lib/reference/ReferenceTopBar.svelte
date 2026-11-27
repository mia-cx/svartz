<!-- The reference top bar: the phone menu button, the site name and version, search, project links, and colour mode. -->
<script lang="ts">
	import type { ResolvedSiteConfig, VaultView } from '@svartz/core';
	import Menu from '@lucide/svelte/icons/menu';
	import X from '@lucide/svelte/icons/x';
	import ColorModeToggle from '../ColorModeToggle.svelte';
	import SearchDialog from '../SearchDialog.svelte';
	import SiteLogo from '../SiteLogo.svelte';
	import type { SearchOptions } from '../search.js';
	import { getVaultHomes } from '../site-routes.js';
	import { themeSettings } from '../theme-settings.js';
	import VersionPicker from './VersionPicker.svelte';
	import { versionLinks } from './versions.js';

	let {
		shell
	}: {
		shell: {
			readonly vault: VaultView;
			readonly site: ResolvedSiteConfig;
			readonly homeHref: string;
			readonly currentHref?: string;
			readonly themeConfig?: Readonly<Record<string, unknown>>;
			readonly searchIndex?: unknown;
			readonly searchOptions?: SearchOptions;
			readonly drawer: boolean;
			readonly toggleDrawer: () => void;
		};
	} = $props();

	const settings = $derived(themeSettings(shell.themeConfig ?? {}));
	const version = $derived(typeof shell.themeConfig?.version === 'string' ? shell.themeConfig.version : undefined);
	const homeOf = getVaultHomes();
	const versions = $derived(
		versionLinks(shell.themeConfig ?? {}, { homeHref: shell.homeHref, currentHref: shell.currentHref ?? shell.homeHref, homeOf })
	);
</script>

<header class="top-bar">
	<div class="brand">
		<button
			class="sv-icon-button menu"
			type="button"
			aria-expanded={shell.drawer}
			aria-controls="explorer-panel"
			aria-label={shell.drawer ? 'Close the page list' : 'Open the page list'}
			onclick={shell.toggleDrawer}
		>
			{#if shell.drawer}<X aria-hidden="true" />{:else}<Menu aria-hidden="true" />{/if}
		</button>
		<a class="sv-wordmark" href={shell.homeHref}><SiteLogo logo={settings.logo} />{shell.site.title}</a>
		{#if versions.length > 0}<VersionPicker {versions} />{:else if version}<span class="sv-badge version" data-sv-signal style:--sv-hue="var(--sv-hue-green)">{version}</span>{/if}
	</div>
	<div class="search"><SearchDialog documents={shell.vault.search} searchIndex={shell.searchIndex} searchOptions={shell.searchOptions} /></div>
	<div class="end">
		{#if settings.navLinks.length > 0}
			<nav class="top-links" aria-label="Project">
				{#each settings.navLinks as link (link.label)}<a href={link.href}>{link.label}</a>{/each}
			</nav>
		{/if}
		<ColorModeToggle />
	</div>
</header>

<style>
	/* Jumps to a heading (contents links, #anchors) stop below the bar instead of under it. */
	:global(html:has(.top-bar)) {
		scroll-padding-block-start: 3.5rem;
	}

	.top-bar {
		position: sticky;
		inset-block-start: 0;
		z-index: var(--sv-z-sticky);
		/* ReferenceFrame's columns, so search spans the page column: sidebar, page, right column. */
		display: grid;
		grid-template-columns: minmax(var(--sv-side-width), max-content) minmax(0, var(--sv-measure)) minmax(var(--sv-rail-min, max-content), 1fr);
		align-items: center;
		column-gap: var(--sv-space-7);
		block-size: 3.5rem;
		/* Edges line up with the centred page below on wide screens. */
		padding-inline: max(var(--sv-space-5), (100% - var(--sv-frame-width)) / 2 + var(--sv-space-5));
		border-block-end: var(--sv-rule-width) solid var(--sv-rule);
		background: var(--sv-paper);
	}

	.brand,
	.end {
		display: flex;
		align-items: center;
		gap: var(--sv-space-3);
	}

	/* A long title may borrow half the gap before it pushes search off the page column. */
	.brand {
		margin-inline-end: calc(-0.5 * var(--sv-space-7));
	}

	.end {
		justify-content: end;
	}

	.sv-wordmark {
		font-size: var(--sv-step-1);
		white-space: nowrap;
	}

	.search {
		min-inline-size: 0;
	}

	.search :global(.sv-search-trigger) {
		inline-size: 100%;
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

	/* The right column drops under the page and the project links move to the sidebar (ReferenceFrame), so the bar's
	   last column only holds the color toggle and search keeps the page's width. */
	@media (max-width: 75rem) {
		.top-bar {
			grid-template-columns: minmax(var(--sv-side-width), max-content) minmax(0, var(--sv-measure)) minmax(max-content, 1fr);
		}

		.top-links {
			display: none;
		}
	}

	@media (max-width: 50rem) {
		.menu {
			display: inline-grid;
		}

		.top-bar {
			display: flex;
			gap: var(--sv-space-3);
			padding-inline: var(--sv-space-3);
		}

		.version {
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
	}
</style>
