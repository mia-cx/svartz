<!-- The docs header: the phone menu button, package name and version, search, project links, and colour mode. -->
<script lang="ts">
	import Menu from '@lucide/svelte/icons/menu';
	import X from '@lucide/svelte/icons/x';
	import { ColorModeToggle, SearchDialog, themeSettings } from '@svartz/ui';
	import type { RegionProps } from '@svartz/theme-minimal/runtime';

	let { shell }: RegionProps = $props();

	const links = $derived(themeSettings(shell.themeConfig).navLinks);
	const version = $derived(typeof shell.themeConfig?.version === 'string' ? shell.themeConfig.version : undefined);
</script>

<button
	class="sv-icon-button menu"
	type="button"
	aria-expanded={shell.drawer}
	aria-controls="explorer-panel"
	aria-label={shell.drawer ? 'Close the reference' : 'Open the reference'}
	onclick={shell.toggleDrawer}
>
	{#if shell.drawer}<X aria-hidden="true" />{:else}<Menu aria-hidden="true" />{/if}
</button>
<a class="sv-wordmark" href={shell.homeHref}>{shell.site.title}</a>
{#if version}<span class="sv-badge version" data-sv-signal style:--sv-hue="var(--sv-hue-green)">v{version}</span>{/if}
<div class="search"><SearchDialog documents={shell.vault.search} searchIndex={shell.searchIndex} searchOptions={shell.searchOptions} /></div>
{#if links.length > 0}
	<nav class="top-links" aria-label="Project">
		{#each links as link (link.label)}<a href={link.href}>{link.label}</a>{/each}
	</nav>
{/if}
<ColorModeToggle />

<style>
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
		color: var(--sv-accent-text);
	}

	.menu {
		display: none;
	}

	@media (max-width: 52rem) {
		.menu {
			display: inline-grid;
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
