<!-- Right-rail contents with the sections on screen marked. -->
<script lang="ts">
	import type { TocItem } from '../symbols.js';

	let { items }: { items: readonly TocItem[] } = $props();

	const shallowest = $derived(Math.min(...items.map((item) => item.depth)));
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
	<nav class="on-this-page" aria-labelledby="on-this-page-heading">
		<h2 id="on-this-page-heading" class="sv-section-title">On this page</h2>
		<ol>
			{#each items as item (item.slug)}
				<li style:--depth={item.depth - shallowest}>
					<a href="#{item.slug}" data-visible={visible.has(item.slug) ? '' : undefined}>{item.text}</a>
				</li>
			{/each}
		</ol>
	</nav>
{/if}

<style>
	.on-this-page {
		font-size: var(--sv-step--1);
	}

	ol {
		margin: var(--sv-space-2) 0 0;
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
	}

	a:hover {
		color: var(--sv-ink);
	}

	a[data-visible] {
		border-inline-start-color: var(--sv-accent);
		color: var(--sv-ink);
	}
</style>
