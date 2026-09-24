<!-- The API sidebar: guides, then each resource with its models and method-labelled operations. -->
<script lang="ts">
	import type { FolderIndexEntry, IndexEntry } from '@svartz/core';
	import MethodPill from './MethodPill.svelte';
	import { apiNav, readModel, readOperation } from '../api.js';

	let {
		entries,
		folders,
		currentHref
	}: { entries: readonly IndexEntry[]; folders: readonly FolderIndexEntry[]; currentHref: string } = $props();

	const sections = $derived(apiNav(entries, folders));
	const current = (href: string) => (href === currentHref ? 'page' : undefined);
</script>

<nav class="api-nav" aria-label="API reference">
	{#each sections as section (section.title)}
		<section>
			<h2 class="sv-section-title">
				{#if section.href}<a href={section.href} aria-current={current(section.href)}>{section.title}</a>{:else}{section.title}{/if}
			</h2>
			<ul>
				{#each section.entries as entry (entry.slug)}
					{@const operation = readOperation(entry.properties)}
					{@const model = readModel(entry.properties)}
					<li>
						<a href={entry.href} aria-current={current(entry.href)}>
							{#if operation}<MethodPill {operation} compact />{:else if model}<span class="sv-label model">Model</span>{/if}
							<span class="label">{model ? `The ${model.name} object` : entry.title}</span>
						</a>
					</li>
				{/each}
			</ul>
		</section>
	{/each}
</nav>

<style>
	.api-nav {
		display: grid;
		gap: var(--sv-space-5);
		font-size: var(--sv-step--1);
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

	a {
		display: flex;
		align-items: center;
		gap: var(--sv-space-2);
		padding: 0.25rem var(--sv-space-2);
		margin-inline: calc(-1 * var(--sv-space-2));
		border-radius: var(--sv-radius-s);
		color: var(--sv-text);
		text-decoration: none;
	}

	a:hover {
		background: var(--sv-surface);
		color: var(--sv-ink);
	}

	a[aria-current] {
		background: var(--sv-surface);
		color: var(--sv-ink);
		font-weight: 600;
		box-shadow: inset 2px 0 0 var(--sv-accent);
	}

	.model {
		min-inline-size: 3em;
		font-size: 0.6rem;
		text-align: center;
	}

	.label {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
</style>
