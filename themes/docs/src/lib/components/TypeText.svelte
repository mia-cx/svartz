<!-- A type expression in code type, with `[[Name]]` references linked to their symbol pages. -->
<script lang="ts">
	import type { IndexEntry } from '@svartz/core';
	import { wikilinkSegments } from '@svartz/ui';

	let { value, entries }: { value: string; entries: readonly IndexEntry[] } = $props();
</script>

<code class="type">
	{#each wikilinkSegments(value, entries) as segment, index (index)}
		{#if segment.href}<a href={segment.href} data-sv-internal>{segment.text}</a>{:else}{segment.text}{/if}
	{/each}
</code>

<style>
	.type {
		color: var(--sv-ink);
		font-family: var(--sv-font-mono);
		font-size: 0.88em;
	}

	a {
		color: var(--sv-accent-text);
		text-decoration: underline;
		text-decoration-color: var(--sv-accent-soft);
		text-underline-offset: 0.2em;
	}

	a:hover {
		text-decoration-color: var(--sv-accent);
	}
</style>
