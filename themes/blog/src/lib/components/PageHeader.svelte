<!-- Centred header for blog list pages: an optional label, the title, and a summary. -->
<script lang="ts">
	let { label, title, summary }: { label?: string; title: string; summary?: string } = $props();
</script>

<header class="page-header">
	{#if label}<p class="sv-label">{label}</p>{/if}
	<h1>{title}</h1>
	{#if summary}<p class="summary">{summary}</p>{/if}
</header>

<style>
	.page-header {
		padding-block: var(--sv-space-6);
		margin-block-end: var(--sv-space-6);
		border-block-end: var(--sv-rule-width) solid var(--sv-rule);
		text-align: center;
	}

	.sv-label {
		margin: 0 0 var(--sv-space-2);
		color: var(--sv-accent-text);
	}

	h1 {
		margin: 0;
		color: var(--sv-ink);
		font-size: var(--sv-step-5);
		font-weight: 700;
		line-height: 1.05;
	}

	.summary {
		max-inline-size: 36rem;
		margin: var(--sv-space-3) auto 0;
		color: var(--sv-text);
		font-size: var(--sv-step-1);
	}
</style>
