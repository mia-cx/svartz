<!-- Previous and next pages in explorer order, below the page. -->
<script lang="ts">
	import type { RegionProps } from '../extension.js';

	let { shell }: RegionProps = $props();
</script>

{#if shell.chrome.pageNav && shell.entry && (shell.previous || shell.next)}
	<nav class="page-nav" aria-label="Previous and next">
		{#if shell.previous}
			<a class="previous" href={shell.previous.href} rel="prev"><span class="sv-label">Previous</span><span class="title">{shell.previous.title}</span></a>
		{/if}
		{#if shell.next}
			<a class="next" href={shell.next.href} rel="next"><span class="sv-label">Next</span><span class="title">{shell.next.title}</span></a>
		{/if}
	</nav>
{/if}

<style>
	.page-nav {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: var(--sv-space-3);
		margin-block-start: var(--sv-space-7);
	}

	a {
		display: grid;
		gap: var(--sv-space-1);
		padding: var(--sv-space-3) var(--sv-space-4);
		border: var(--sv-rule-width) solid var(--sv-rule);
		border-radius: var(--sv-radius-m);
		color: var(--sv-text);
		text-decoration: none;
		transition: border-color var(--sv-duration-fast) var(--sv-ease);
	}

	a:hover {
		border-color: var(--sv-accent);
	}

	.next {
		grid-column: 2;
		text-align: end;
	}

	.title {
		color: var(--sv-ink);
		font-weight: 600;
		overflow-wrap: anywhere;
	}

	@media (max-width: 50rem) {
		.page-nav {
			grid-template-columns: minmax(0, 1fr);
		}

		.next {
			grid-column: 1;
		}
	}
</style>
