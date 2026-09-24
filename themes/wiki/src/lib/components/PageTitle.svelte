<!-- Title block for wiki list pages: the title over a rule, then a one-line summary. -->
<script lang="ts">
	let { title, summary }: { title: string; summary?: string } = $props();
</script>

<header class="page-title">
	<h1>{title}</h1>
</header>
{#if summary}<p class="summary">{summary}</p>{/if}

<style>
	.page-title {
		margin-block-end: var(--sv-space-3);
		padding-block-end: var(--sv-space-2);
		border-block-end: var(--sv-rule-width) solid var(--sv-rule-strong);
	}

	h1 {
		margin: 0;
		color: var(--sv-ink);
		font-size: var(--sv-step-5);
		font-weight: 700;
		letter-spacing: -0.02em;
		line-height: 1.1;
	}

	.summary {
		margin: 0 0 var(--sv-space-5);
		color: var(--sv-text);
	}
</style>
