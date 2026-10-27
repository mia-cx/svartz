<!--
	The wiki's header: the site name over the rail, a wide search over the
	article, colour mode, and the section bar from the vault's top-level
	folders. On phones and tablets a menu button opens the rail as a drawer and
	the section bar moves into it.
-->
<script lang="ts">
	import Menu from '@lucide/svelte/icons/menu';
	import X from '@lucide/svelte/icons/x';
	import type { RegionProps } from '@svartz/theme-minimal/runtime';
	import { ColorModeToggle, SearchDialog } from '@svartz/ui';
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
	<a class="sv-wordmark" href={shell.homeHref}>{shell.site.title}</a>
	<div class="search"><SearchDialog documents={shell.vault.search} searchIndex={shell.searchIndex} searchOptions={shell.searchOptions} /></div>
	<ColorModeToggle />
	{#if menu.length > 0}
		<div class="section-bar"><SectionBar {menu} currentPath={shell.currentHref} currentFolders={shell.trail} /></div>
	{/if}
</div>

<style>
	/* Same columns as the page below: the name over the rail, search over the article. */
	.header-inner {
		display: grid;
		grid-template-columns: 14rem minmax(0, 36rem) 1fr;
		align-items: center;
		grid-template-rows: calc(3.5rem - var(--sv-rule-width));
		grid-auto-rows: 2.25rem;
		column-gap: var(--sv-space-7);
		max-inline-size: 84rem;
		margin-inline: auto;
		padding-inline: var(--sv-space-5);
	}

	.header-inner > :global(.sv-color-mode) {
		justify-self: end;
	}

	/* Under the search, aligned with the article. */
	.section-bar {
		grid-column: 2 / -1;
		align-self: end;
	}

	.sv-wordmark {
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

	@media (max-width: 56rem) {
		.menu {
			display: inline-grid;
		}

		.section-bar {
			display: none;
		}

		.header-inner {
			block-size: 100%;
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
	}

	@media (max-width: 40rem) {
		.sv-wordmark {
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
