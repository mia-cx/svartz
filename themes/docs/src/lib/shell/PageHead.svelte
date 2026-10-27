<!--
	Breadcrumbs up to the page's folder; for a guide, also its title, summary,
	and page actions. Symbol pages head themselves under the breadcrumbs.
-->
<script lang="ts">
	import { PageActions, pageCrumbs } from '@svartz/ui';
	import type { RegionProps } from '@svartz/theme-minimal/runtime';

	let { shell }: RegionProps = $props();

	const crumbs = $derived(pageCrumbs(shell.vault, shell.entry, shell.match).slice(0, -1));
	const entry = $derived(shell.headed ? undefined : shell.entry);
</script>

{#if crumbs.length > 0}
	<nav class="crumbs" aria-label="Breadcrumbs">
		{#each crumbs as crumb, index (crumb.href)}{#if index > 0}<span aria-hidden="true">/</span>{/if}<a href={crumb.href}>{crumb.title}</a>{/each}
	</nav>
{/if}
{#if entry}
	<header class="page-head">
		<h1>{entry.title}</h1>
		{#if entry.description}<p class="summary">{entry.description}</p>{/if}
		{#if entry.markdownHref}<PageActions href={entry.markdownHref} />{/if}
	</header>
{/if}

<style>
	.crumbs {
		display: flex;
		flex-wrap: wrap;
		gap: var(--sv-space-2);
		margin-block-end: var(--sv-space-3);
		font-size: var(--sv-step--1);
	}

	.crumbs a {
		color: var(--sv-muted);
		text-decoration: none;
	}

	.crumbs a:hover {
		color: var(--sv-accent-text);
	}

	.crumbs span {
		color: var(--sv-rule-strong);
	}

	.page-head {
		margin-block-end: var(--sv-space-5);
	}

	h1 {
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
</style>
