<!-- Under the page: when it was last updated, and the Svartz credit. -->
<script lang="ts">
	import { formatDate, isoDate, noteDate } from '@svartz/ui';
	import type { RegionProps } from '@svartz/theme-minimal/runtime';

	let { shell }: RegionProps = $props();

	const updated = $derived(shell.entry ? noteDate(shell.entry) : undefined);
</script>

<div class="page-footer">
	{#if updated}<p>Last updated <time datetime={isoDate(updated)}>{formatDate(updated)}</time></p>{/if}
	<p>{shell.site.title}{' · '}Published with <a href="https://github.com/mia-cx/svartz">Svartz</a></p>
</div>

<style>
	.page-footer {
		display: flex;
		flex-wrap: wrap;
		justify-content: space-between;
		gap: var(--sv-space-2);
		color: var(--sv-muted);
		font-size: var(--sv-step--1);
	}

	p {
		margin: 0;
	}

	a {
		color: var(--sv-text);
	}
</style>
