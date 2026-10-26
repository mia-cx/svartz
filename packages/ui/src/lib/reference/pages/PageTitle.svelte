<script lang="ts">
	let { title, summary }: { title: string; summary?: string } = $props();
</script>

<header class="page-title">
	<h1>{title}</h1>
	{#if summary}<p>{summary}</p>{/if}
</header>

<style>
	.page-title {
		margin-block-end: var(--sv-space-6);
	}

	h1 {
		margin: 0;
		color: var(--sv-ink);
		font-size: var(--sv-step-4);
		font-weight: 700;
		line-height: 1.1;
	}

	p {
		margin: var(--sv-space-3) 0 0;
		color: var(--sv-text);
		font-size: var(--sv-step-1);
	}
</style>
