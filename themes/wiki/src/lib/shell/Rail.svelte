<!--
	The left rail: the portal (main page, list pages, a random page) and the
	article's numbered contents. In the phone drawer the section menu leads it,
	and an open section takes the drawer over.
-->
<script lang="ts">
	import { goto } from '$app/navigation';
	import type { RegionProps } from '@svartz/theme-minimal/runtime';
	import Contents from '../components/Contents.svelte';
	import DrawerMenu from '../components/DrawerMenu.svelte';
	import { sectionMenu, wikiRoutes, type MenuFolder } from '../wiki.js';

	let { shell }: RegionProps = $props();

	const menu = $derived(sectionMenu(shell.tree, shell.vault.folders));
	const prefixes = $derived(wikiRoutes(shell.themeConfig));
	const mount = $derived(shell.vault.routes.mountPath);
	const portal = $derived([
		{ label: 'Main page', href: shell.homeHref },
		{ label: 'Recent changes', href: `${mount}/${prefixes.feed}/` },
		{ label: 'All pages', href: `${mount}/${prefixes.folders}/` },
		{ label: 'Categories', href: `${mount}/${prefixes.tags}/` }
	]);

	function randomPage() {
		const candidates = shell.vault.entries.filter((note) => note.href !== shell.currentHref);
		const pick = candidates[Math.floor(Math.random() * candidates.length)];
		if (pick) void goto(pick.href);
	}

	// The drawer's open sections; it starts at the section list each time.
	let drawerTrail = $state<MenuFolder[]>([]);
	$effect(() => {
		if (!shell.drawer) drawerTrail = [];
	});
</script>

{#if menu.length > 0}
	<div class="drawer-only">
		<DrawerMenu {menu} currentPath={shell.currentHref} currentFolders={shell.trail} bind:trail={drawerTrail} />
	</div>
{/if}
<div class="rail-root" class:drilled={drawerTrail.length > 0}>
	<nav class="portal" aria-labelledby="portal-heading">
		<h2 id="portal-heading" class="sv-section-title">Navigation</h2>
		<ul>
			{#each portal as link (link.label)}
				<li><a href={link.href} aria-current={shell.currentHref === link.href ? 'page' : undefined}>{link.label}</a></li>
			{/each}
			<li><button type="button" onclick={randomPage}>Random page</button></li>
		</ul>
	</nav>
	<Contents items={shell.toc} />
</div>

<style>
	.drawer-only {
		display: none;
	}

	.rail-root {
		display: grid;
		align-content: start;
		gap: var(--sv-space-6);
	}

	.portal ul {
		display: grid;
		gap: var(--sv-space-1);
		margin: var(--sv-space-2) 0 0;
		padding: 0;
		list-style: none;
		font-size: var(--sv-step--1);
	}

	.portal a,
	.portal button {
		padding: 0;
		border: 0;
		background: none;
		color: var(--sv-text);
		font: inherit;
		text-decoration: none;
		cursor: pointer;
	}

	.portal a:hover,
	.portal button:hover {
		color: var(--sv-accent-text);
	}

	.portal a[aria-current] {
		color: var(--sv-ink);
		font-weight: 600;
	}

	@media (max-width: 56rem) {
		.drawer-only {
			display: block;
		}

		/* An open section takes over the drawer, like a page. */
		.rail-root.drilled {
			display: none;
		}
	}
</style>
