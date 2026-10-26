<!-- A titled section of a reference page: Parameters, Request body, Input, Responses. -->
<script lang="ts">
	import type { Snippet } from 'svelte';

	let { id, title, note, children }: { id: string; title: string; note?: string; children: Snippet } = $props();
</script>

<section class="sv-reference-section" aria-labelledby={id}>
	<h2 {id}>{title}{#if note}<span class="note">{note}</span>{/if}</h2>
	{@render children()}
</section>

<style>
	.sv-reference-section {
		margin-block-start: var(--sv-space-6);
	}

	h2 {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: var(--sv-space-1) var(--sv-space-3);
		margin: 0 0 var(--sv-space-2);
		padding-block-end: var(--sv-space-1);
		border-block-end: var(--sv-rule-width) solid var(--sv-rule-strong);
		color: var(--sv-ink);
		font-size: var(--sv-step-1);
		font-weight: 700;
	}

	.note {
		color: var(--sv-muted);
		font-family: var(--sv-font-mono);
		font-size: 0.75rem;
		font-weight: 400;
	}
</style>
