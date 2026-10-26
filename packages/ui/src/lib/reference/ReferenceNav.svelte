<!--
	The reference sidebar: a filter, then one section per top-level folder and
	one group per folder inside it. Reference pages show a fixed-width badge
	beside their path or name, so long paths wrap without moving the badges.
	Nested groups fold shut unless they hold the current page or a filter match.
-->
<script lang="ts">
	import type { IndexEntry } from '@svartz/core';
	import Badge from './Badge.svelte';
	import BreakAfterSlashes from './BreakAfterSlashes.svelte';
	import { filterReferenceNav, navLinks, type ReferenceNavSection } from './nav.js';

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
	const isCurrent = (href: string | undefined) => href !== undefined && href === currentHref;
	const current = (href: string | undefined) => (isCurrent(href) ? 'page' : undefined);

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
			list?.querySelector<HTMLAnchorElement>('li .link')?.click();
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
				{#each section.groups as group (group.slug)}
					{#if group.title}
						{@const titled = section.groups.filter((candidate) => candidate.title).length}
						<details
							class="group"
							open={filtering || titled === 1 || isCurrent(group.href) || group.links.some((link) => isCurrent(link.entry.href))}
						>
							<summary>{group.title}</summary>
							<ul>
								{#if group.href}<li><a class="link" href={group.href} aria-current={current(group.href)}><span class="label">Overview</span></a></li>{/if}
								{@render links(group.links)}
							</ul>
						</details>
					{:else}
						<ul>{@render links(group.links)}</ul>
					{/if}
				{/each}
			</section>
		{:else}
			<p class="empty">No pages match “{query.trim()}”.</p>
		{/each}
	</div>
</nav>

{#snippet links(items: (typeof shown)[number]['groups'][number]['links'])}
	{#each items as { entry, item } (entry.slug)}
		<li>
			<a class="link" href={entry.href} aria-current={current(entry.href)}>
				{#if item.badge}<Badge badge={item.badge} fixed />{/if}
				<span class="label" class:code={item.badge}><BreakAfterSlashes text={item.label} /></span>
			</a>
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

	.group {
		margin-block-start: var(--sv-space-2);
	}

	.group ul {
		margin: var(--sv-space-1) 0 0;
		padding-inline-start: var(--sv-space-2);
		border-inline-start: var(--sv-rule-width) solid var(--sv-rule);
	}

	summary {
		display: flex;
		align-items: baseline;
		gap: var(--sv-space-1);
		color: var(--sv-ink);
		font-weight: 600;
		cursor: pointer;
		list-style: none;
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
