<!--
	The blog's header: the site name, the header links, search, and colour
	mode. On phones the links fold into the shell's drawer, which is why the
	nav carries the drawer's `explorer-panel` id.
-->
<script lang="ts">
	import Menu from '@lucide/svelte/icons/menu';
	import X from '@lucide/svelte/icons/x';
	import type { RegionProps } from '@svartz/theme-minimal/runtime';
	import { ColorModeToggle, SearchDialog } from '@svartz/ui';
	import { headerLinks } from '../blog.js';

	let { shell }: RegionProps = $props();

	const links = $derived(headerLinks(shell));
</script>

<div class="bar">
	<a class="sv-wordmark" href={shell.homeHref}>{shell.site.title}</a>
	<nav class="nav" data-open={shell.drawer ? '' : undefined} id="explorer-panel" aria-label="Main">
		<ul>
			{#each links as link (link.href)}
				<li><a href={link.href} aria-current={shell.currentHref === link.href ? 'page' : undefined}>{link.label}</a></li>
			{/each}
		</ul>
	</nav>
	<div class="tools">
		<SearchDialog documents={shell.vault.search} searchIndex={shell.searchIndex} searchOptions={shell.searchOptions} variant="icon" />
		<ColorModeToggle />
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
	</div>
</div>

<style>
	.bar {
		display: flex;
		align-items: center;
		gap: var(--sv-space-6);
		padding-block: var(--sv-space-4);
	}

	.nav {
		flex: 1;
	}

	.nav ul {
		display: flex;
		gap: var(--sv-space-5);
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.nav a {
		color: var(--sv-text);
		font-weight: 600;
		text-decoration: none;
	}

	.nav a:hover,
	.nav a[aria-current] {
		color: var(--sv-ink);
		box-shadow: inset 0 -2px 0 var(--sv-accent);
	}

	.tools {
		display: flex;
		align-items: center;
		gap: var(--sv-space-1);
	}

	.menu {
		display: none;
	}

	@media (max-width: 44rem) {
		.menu {
			display: inline-grid;
		}

		.bar {
			flex-wrap: wrap;
			gap: var(--sv-space-2);
		}

		.bar .sv-wordmark {
			flex: 1;
			font-size: var(--sv-step-1);
		}

		.nav {
			display: none;
			flex-basis: 100%;
			order: 3;
		}

		.nav[data-open] {
			display: block;
		}

		.nav ul {
			flex-direction: column;
			gap: var(--sv-space-3);
			padding-block: var(--sv-space-3);
		}
	}
</style>
