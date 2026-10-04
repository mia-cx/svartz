<script lang="ts">
	let { title, summary, mono = false }: { title: string; summary?: string; mono?: boolean } = $props();
</script>

<header class="page-title">
	<h1 class:mono>{title}</h1>
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

	h1.mono {
		font-family: var(--sv-font-mono);
	}

	p {
		margin: var(--sv-space-3) 0 0;
		color: var(--sv-text);
		font-size: var(--sv-step-1);
	}
</style>
