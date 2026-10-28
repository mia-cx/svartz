<!-- The reference top bar: the phone menu button, the site name and version, search, project links, and colour mode. -->
<script lang="ts">
	import type { ResolvedSiteConfig, VaultView } from '@svartz/core';
	import Menu from '@lucide/svelte/icons/menu';
	import X from '@lucide/svelte/icons/x';
	import ColorModeToggle from '../ColorModeToggle.svelte';
	import SearchDialog from '../SearchDialog.svelte';
	import type { SearchOptions } from '../search.js';
	import { themeSettings } from '../theme-settings.js';

	let {
		shell
	}: {
		shell: {
			readonly vault: VaultView;
			readonly site: ResolvedSiteConfig;
			readonly homeHref: string;
			readonly themeConfig?: Readonly<Record<string, unknown>>;
			readonly searchIndex?: unknown;
			readonly searchOptions?: SearchOptions;
			readonly drawer: boolean;
			readonly toggleDrawer: () => void;
		};
	} = $props();

	const settings = $derived(themeSettings(shell.themeConfig ?? {}));
	const version = $derived(typeof shell.themeConfig?.version === 'string' ? shell.themeConfig.version : undefined);
</script>

<header class="top-bar">
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
	<a class="sv-wordmark" href={shell.homeHref}>{shell.site.title}</a>
	{#if version}<span class="sv-badge version" data-sv-signal style:--sv-hue="var(--sv-hue-green)">{version}</span>{/if}
	<div class="search"><SearchDialog documents={shell.vault.search} searchIndex={shell.searchIndex} searchOptions={shell.searchOptions} /></div>
	{#if settings.navLinks.length > 0}
		<nav class="top-links" aria-label="Project">
			{#each settings.navLinks as link (link.href)}<a href={link.href}>{link.label}</a>{/each}
		</nav>
	{/if}
	<ColorModeToggle />
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
		display: flex;
		align-items: center;
		gap: var(--sv-space-3);
		block-size: 3.5rem;
		/* Edges line up with the centred page below on wide screens. */
		padding-inline: max(var(--sv-space-5), (100% - 100rem) / 2 + var(--sv-space-5));
		border-block-end: var(--sv-rule-width) solid var(--sv-rule);
		background: var(--sv-paper);
	}

	.sv-wordmark {
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
	}
</style>
