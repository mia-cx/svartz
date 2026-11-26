<!--
	The wiki's header, one bar: the site name over the rail, the section bar from
	the vault's top-level folders over the article, then search and colour mode.
	Sections that don't fit wait in the bar's More menu. On phones and tablets a
	menu button opens the rail as a drawer and the section bar moves into it.
-->
<script lang="ts">
	import Menu from '@lucide/svelte/icons/menu';
	import X from '@lucide/svelte/icons/x';
	import type { RegionProps } from '@svartz/theme-minimal/runtime';
	import { ColorModeToggle, SearchDialog, SiteLogo, themeSettings } from '@svartz/ui';
	import SectionBar from '../components/SectionBar.svelte';
	import { sectionMenu } from '../wiki.js';

	let { shell }: RegionProps = $props();

	const menu = $derived(sectionMenu(shell.tree, shell.vault.folders));
</script>

<div class="header-inner">
	<button
		class="sv-icon-button menu"
		type="button"
		aria-expanded={shell.drawer}
		aria-controls="explorer-panel"
		aria-label={shell.drawer ? 'Close the menu' : 'Open the menu'}
		onclick={shell.toggleDrawer}
	>
		{#if shell.drawer}<X aria-hidden="true" />{:else}<Menu aria-hidden="true" />{/if}
	</button>
	<a class="sv-wordmark" href={shell.homeHref}><SiteLogo logo={themeSettings(shell.themeConfig).logo} />{shell.site.title}</a>
	<div class="section-bar">
		{#if menu.length > 0}<SectionBar {menu} currentPath={shell.currentHref} currentFolders={shell.trail} />{/if}
	</div>
	<div class="tools">
		<div class="search"><SearchDialog documents={shell.vault.search} searchIndex={shell.searchIndex} searchOptions={shell.searchOptions} /></div>
		<ColorModeToggle />
	</div>
</div>

<style>
	/* Same columns as the page below: the name over the rail, the sections over the article. */
	.header-inner {
		display: grid;
		grid-template-columns: var(--sv-side-width) minmax(0, 1fr) auto;
		align-items: center;
		block-size: 100%;
		column-gap: var(--sv-space-7);
		max-inline-size: var(--sv-frame-width);
		margin-inline: auto;
		padding-inline: var(--sv-space-5);
	}

	/* Full height, so the current section's underline meets the header's rule. */
	.section-bar {
		align-self: stretch;
		min-inline-size: 0;
	}

	.tools {
		display: flex;
		align-items: center;
		gap: var(--sv-space-3);
	}

	.sv-wordmark {
		font-size: var(--sv-step-1);
		white-space: nowrap;
	}

	.search {
		display: flex;
		inline-size: clamp(11rem, 18vw, 16rem);
	}

	.search :global(.sv-search-trigger) {
		flex: 1;
	}

	.menu {
		display: none;
	}

	@media (max-width: 50rem) {
		.menu {
			display: inline-grid;
		}

		.section-bar {
			display: none;
		}

		.header-inner {
			display: flex;
			gap: var(--sv-space-2);
			padding-inline: var(--sv-space-3);
		}

		.tools {
			flex: 1;
			gap: var(--sv-space-2);
		}

		.search {
			flex: 1;
			inline-size: auto;
		}
	}

	@media (max-width: 40rem) {
		.sv-wordmark {
			overflow: hidden;
			text-overflow: ellipsis;
		}

		.tools {
			justify-content: flex-end;
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
