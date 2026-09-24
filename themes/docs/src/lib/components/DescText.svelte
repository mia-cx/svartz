<!-- A frontmatter description: `backticks` become code and `[[Name]]` becomes a link. -->
<script lang="ts">
	import type { IndexEntry } from '@svartz/core';
	import { wikilinkSegments } from '@svartz/ui';

	let { value, entries }: { value: string; entries: readonly IndexEntry[] } = $props();

	// Odd parts sat between backticks.
	const parts = $derived(value.split('`'));
</script>

{#each parts as part, index (index)}
	{#if index % 2 === 1}<code>{part}</code>{:else}{#each wikilinkSegments(part, entries) as segment, segmentIndex (segmentIndex)}{#if segment.href}<a
					href={segment.href}
					data-sv-internal>{segment.text}</a
				>{:else}{segment.text}{/if}{/each}{/if}
{/each}

<style>
	code {
		padding: 0.05em 0.3em;
		border-radius: var(--sv-radius-s);
		background: var(--sv-sunken);
		color: var(--sv-ink);
		font-family: var(--sv-font-mono);
		font-size: 0.86em;
	}

	a {
		color: var(--sv-ink);
		text-decoration-color: var(--sv-accent);
		text-underline-offset: 0.2em;
	}
</style>
