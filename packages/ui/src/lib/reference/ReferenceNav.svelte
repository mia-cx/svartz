<!--
	The reference sidebar: a filter, then one section per top-level folder, with
	its folders nested inside it as a tree at any depth. Reference pages show a
	fixed-width badge beside their path or name, so long paths wrap without
	moving the badges.

	Folders open and close like the explorer. The current page's folders open on
	arrival and on every navigation; folders a reader opened or closed stay that
	way. A filter opens the path to every match, and clearing it restores the
	reader's own choices.
-->
<script lang="ts">
	import type { IndexEntry } from '@svartz/core';
	import { untrack } from 'svelte';
	import { SvelteSet } from 'svelte/reactivity';
	import Badge from './Badge.svelte';
	import BreakAfterSlashes from './BreakAfterSlashes.svelte';
	import { filterReferenceNav, folderTrail, navLinks, type ReferenceNavFolder, type ReferenceNavSection } from './nav.js';

	let {
		sections,
		currentHref,
		filterInput = $bindable()
	}: {
		sections: readonly ReferenceNavSection<IndexEntry>[];
		currentHref: string;
		/** The filter field, for the layout to focus when the drawer opens. */
		filterInput?: HTMLInputElement;
	} = $props();

	let query = $state('');
	let list: HTMLElement | undefined = $state();
	const shown = $derived(filterReferenceNav(sections, query));
	const matches = $derived(navLinks(shown).length);
	const filtering = $derived(query.trim().length > 0);
	const current = (href: string | undefined) => (href !== undefined && href === currentHref ? 'page' : undefined);

	/** A folder that is its parent's only subfolder opens with it, so a lone folder never hides a section. */
	const loneFolders = (folder: ReferenceNavFolder<IndexEntry>): string[] =>
		folder.folders.length === 1 ? [folder.folders[0].slug, ...loneFolders(folder.folders[0])] : folder.folders.flatMap(loneFolders);

	// Folders the reader has open. Server-rendered pages start with the current page's path open.
	const opened = new SvelteSet<string>(untrack(() => [...sections.flatMap(loneFolders), ...folderTrail(sections, currentHref)]));

	$effect.pre(() => {
		for (const slug of folderTrail(sections, currentHref)) untrack(() => opened.add(slug));
	});

	/** Records the reader's own opening and closing; a filter's forced opening isn't theirs. */
	function remember(slug: string, open: boolean) {
		if (filtering) return;
		if (open) opened.add(slug);
		else opened.delete(slug);
	}

	// Keep the current page in view when it sits far down a long sidebar.
	$effect(() => {
		void currentHref;
		list?.querySelector('[aria-current="page"]')?.scrollIntoView({ block: 'nearest' });
	});

	function onkeydown(event: KeyboardEvent) {
		if (event.key === 'Escape' && query) {
			event.preventDefault();
			event.stopPropagation();
			query = '';
		}
		// Enter opens the first match, so filter-then-Enter works like a jump box.
		if (event.key === 'Enter' && filtering) {
			event.preventDefault();
			// A group's Overview link isn't a match; it stays for context.
			list?.querySelector<HTMLAnchorElement>('li .link:not(.overview)')?.click();
		}
	}
</script>

<nav class="sv-reference-nav" aria-label="Reference">
	<div class="filter">
		<label class="sv-visually-hidden" for="sv-reference-filter">Filter pages</label>
		<input
			bind:this={filterInput}
			bind:value={query}
			id="sv-reference-filter"
			type="search"
			placeholder="Filter"
			autocomplete="off"
			spellcheck="false"
			{onkeydown}
		/>
		<p class="sv-visually-hidden" role="status">{filtering ? `${matches} ${matches === 1 ? 'page matches' : 'pages match'}` : ''}</p>
	</div>

	<div class="sections" bind:this={list}>
		{#each shown as section (section.slug)}
			<section>
				<h2 class="sv-section-title">
					{#if section.href}<a href={section.href} aria-current={current(section.href)}>{section.title}</a>{:else}{section.title}{/if}
				</h2>
				<ul>{@render contents(section)}</ul>
			</section>
		{:else}
			<p class="empty">No pages match “{query.trim()}”.</p>
		{/each}
	</div>
</nav>

{#snippet contents(folder: ReferenceNavFolder<IndexEntry>)}
	{#each folder.links as { entry, item } (entry.slug)}
		<li>
			<a class="link" href={entry.href} aria-current={current(entry.href)}>
				{#if item.badge}<Badge badge={item.badge} fixed />{/if}
				<span class="label" class:code={item.badge}><BreakAfterSlashes text={item.label} /></span>
			</a>
		</li>
	{/each}
	{#each folder.folders as child (child.slug)}
		<li>
			<details class="folder" open={filtering || opened.has(child.slug)} ontoggle={(event) => remember(child.slug, event.currentTarget.open)}>
				<summary>{child.title}</summary>
				<ul>
					{#if child.href}<li><a class="link overview" href={child.href} aria-current={current(child.href)}><span class="label">Overview</span></a></li>{/if}
					{@render contents(child)}
				</ul>
			</details>
		</li>
	{/each}
{/snippet}

<style>
	.sv-reference-nav {
		display: grid;
		gap: var(--sv-space-4);
		font-size: var(--sv-step--1);
	}

	.filter input {
		box-sizing: border-box;
		inline-size: 100%;
		padding: var(--sv-space-1) var(--sv-space-2);
		border: var(--sv-rule-width) solid var(--sv-rule);
		border-radius: var(--sv-radius-m);
		background: var(--sv-paper);
		color: var(--sv-ink);
		font: inherit;
	}

	.filter input::placeholder {
		color: var(--sv-muted);
	}

	.filter input:hover {
		border-color: var(--sv-rule-strong);
	}

	.sections {
		display: grid;
		gap: var(--sv-space-5);
	}

	h2 a {
		color: inherit;
		text-decoration: none;
	}

	ul {
		display: grid;
		gap: 1px;
		margin: var(--sv-space-2) 0 0;
		padding: 0;
		list-style: none;
	}

	.folder {
		margin-block: var(--sv-space-1);
	}

	.folder > ul {
		margin: var(--sv-space-1) 0 0 0.3em;
		padding-inline-start: var(--sv-space-3);
		border-inline-start: var(--sv-rule-width) solid var(--sv-rule);
	}

	summary {
		display: flex;
		align-items: baseline;
		gap: var(--sv-space-1);
		padding-block: 0.15rem;
		border-radius: var(--sv-radius-s);
		color: var(--sv-ink);
		font-weight: 600;
		cursor: pointer;
		list-style: none;
	}

	summary:hover {
		color: var(--sv-accent-text);
	}

	summary::-webkit-details-marker {
		display: none;
	}

	summary::before {
		content: '▸';
		flex: none;
		color: var(--sv-muted);
		transition: rotate var(--sv-duration) var(--sv-ease);
	}

	details[open] > summary::before {
		rotate: 90deg;
	}

	.link {
		display: flex;
		align-items: baseline;
		gap: var(--sv-space-2);
		padding: 0.25rem var(--sv-space-2);
		margin-inline: calc(-1 * var(--sv-space-2));
		border-radius: var(--sv-radius-s);
		color: var(--sv-text);
		text-decoration: none;
	}

	.link:hover {
		background: var(--sv-surface);
		color: var(--sv-ink);
	}

	.link[aria-current] {
		background: var(--sv-surface);
		color: var(--sv-ink);
		font-weight: 600;
		box-shadow: inset 2px 0 0 var(--sv-accent);
	}

	.label {
		min-inline-size: 0;
		overflow-wrap: anywhere;
	}

	.label.code {
		font-family: var(--sv-font-mono);
		font-size: 0.92em;
	}

	.empty {
		margin: 0;
		color: var(--sv-muted);
	}
</style>
