<!-- A list page's title and its count sentence ("29 items under this folder."), as in Quartz. -->
<script lang="ts">
	let { title, summary }: { title: string; summary?: string } = $props();
</script>

<header class="list-header">
	<h1>{title}</h1>
	{#if summary}<p class="summary">{summary}</p>{/if}
</header>

<style>
	.list-header {
		margin-block-end: var(--sv-space-5);
	}

	h1 {
		margin: 0;
		color: var(--sv-ink);
		font-family: var(--sv-font-sans);
		font-size: var(--sv-step-5);
		font-weight: 700;
		letter-spacing: -0.02em;
		line-height: 1.05;
	}

	.summary {
		margin: var(--sv-space-3) 0 0;
		color: var(--sv-text);
	}
</style>
