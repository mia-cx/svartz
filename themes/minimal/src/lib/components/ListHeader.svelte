<script lang="ts">
	let { title, count, label }: { title: string; count?: string; label?: string } = $props();
</script>

<header class="list-header">
	{#if label}<p class="sv-label">{label}</p>{/if}
	<h1>{title}</h1>
	{#if count}<p class="count">{count}</p>{/if}
</header>

<style>
	.list-header {
		margin-block-end: var(--sv-space-5);
	}

	.sv-label {
		margin: 0 0 var(--sv-space-1);
	}

	h1 {
		margin: 0;
		color: var(--sv-ink);
		font-family: var(--sv-font-sans);
		font-size: var(--sv-step-5);
		font-stretch: 112%;
		font-weight: 800;
		letter-spacing: -0.025em;
		line-height: 1.05;
	}

	.count {
		margin: var(--sv-space-2) 0 0;
		color: var(--sv-muted);
	}
</style>
