<!--
	On-this-page contents. Highlights the headings currently on screen. Folds
	with a native <details>, so it works before hydration.
-->
<script lang="ts">
	import type { TocEntry } from '@svartz/core';

	let { items }: { items: readonly TocEntry[] } = $props();

	const shallowest = $derived(Math.min(...items.map((item) => item.depth)));
	let visible = $state<ReadonlySet<string>>(new Set());

	$effect(() => {
		const headings = items
			.map((item) => document.getElementById(item.slug))
			.filter((heading): heading is HTMLElement => heading !== null);
		const onScreen = new Set<string>();
		const observer = new IntersectionObserver((records) => {
			for (const record of records) {
				if (record.isIntersecting) onScreen.add(record.target.id);
				else onScreen.delete(record.target.id);
			}
			visible = new Set(onScreen);
		});
		for (const heading of headings) observer.observe(heading);
		return () => observer.disconnect();
	});
</script>

{#if items.length > 0}
	<details class="toc" open>
		<summary class="sv-label">On this page</summary>
		<ol>
			{#each items as item (item.slug)}
				<li style:--depth={item.depth - shallowest}>
					<a href="#{item.slug}" data-visible={visible.has(item.slug) ? '' : undefined}>{item.text}</a>
				</li>
			{/each}
		</ol>
	</details>
{/if}

<style>
	.toc {
		min-block-size: 0;
		font-size: var(--sv-step--1);
	}

	summary {
		cursor: pointer;
		list-style: none;
		margin-block-end: var(--sv-space-2);
	}

	summary::-webkit-details-marker {
		display: none;
	}

	summary::after {
		content: ' −';
	}

	.toc:not([open]) summary::after {
		content: ' +';
	}

	ol {
		margin: 0;
		padding: 0;
		list-style: none;
		border-inline-start: var(--sv-rule-width) solid var(--sv-rule);
	}

	a {
		display: block;
		margin-inline-start: -1px;
		padding: 0.2rem 0 0.2rem calc(var(--sv-space-3) + var(--depth) * var(--sv-space-3));
		border-inline-start: 2px solid transparent;
		color: var(--sv-muted);
		line-height: 1.35;
		text-decoration: none;
		transition:
			color var(--sv-duration-fast) var(--sv-ease),
			border-color var(--sv-duration-fast) var(--sv-ease);
	}

	a:hover {
		color: var(--sv-ink);
	}

	a[data-visible] {
		border-inline-start-color: var(--sv-accent);
		color: var(--sv-ink);
	}
</style>
