<!--
	Numbered contents for the article (1, 1.1, 2…), with the headings on screen
	marked. Sits in the left rail and stays in view while reading.
-->
<script lang="ts">
	import type { TocEntry } from '@svartz/core';

	let { items }: { items: readonly TocEntry[] } = $props();

	const shallowest = $derived(Math.min(...items.map((item) => item.depth)));
	const numbered = $derived.by(() => {
		const counters: number[] = [];
		return items.map((item) => {
			const level = item.depth - shallowest;
			counters.length = level + 1;
			counters[level] = (counters[level] ?? 0) + 1;
			return { ...item, level, number: counters.map((value) => value ?? 1).join('.') };
		});
	});

	let visible = $state<ReadonlySet<string>>(new Set());
	$effect(() => {
		const onScreen = new Set<string>();
		const observer = new IntersectionObserver((records) => {
			for (const record of records) {
				if (record.isIntersecting) onScreen.add(record.target.id);
				else onScreen.delete(record.target.id);
			}
			visible = new Set(onScreen);
		});
		for (const item of items) {
			const heading = document.getElementById(item.slug);
			if (heading) observer.observe(heading);
		}
		return () => observer.disconnect();
	});
</script>

{#if items.length > 0}
	<nav class="contents" aria-labelledby="contents-heading">
		<h2 id="contents-heading" class="sv-section-title">Contents</h2>
		<ol>
			<li><a href="#top">(Top)</a></li>
			{#each numbered as item (item.slug)}
				<li style:--level={item.level}>
					<a href="#{item.slug}" data-visible={visible.has(item.slug) ? '' : undefined}>
						<span class="number">{item.number}</span>
						{item.text}
					</a>
				</li>
			{/each}
		</ol>
	</nav>
{/if}

<style>
	.contents {
		font-size: var(--sv-step--1);
	}

	h2 {
		margin-block-end: var(--sv-space-2);
	}

	ol {
		display: grid;
		gap: 1px;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	a {
		display: flex;
		gap: var(--sv-space-2);
		padding: 0.15rem 0 0.15rem calc(var(--level, 0) * var(--sv-space-4));
		color: var(--sv-text);
		line-height: 1.35;
		text-decoration: none;
	}

	a:hover {
		color: var(--sv-accent-text);
	}

	a[data-visible] {
		color: var(--sv-ink);
		font-weight: 600;
	}

	.number {
		flex: none;
		min-inline-size: 1.6em;
		color: var(--sv-muted);
		font-variant-numeric: tabular-nums;
	}
</style>
