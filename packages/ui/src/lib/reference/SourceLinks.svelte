<!-- "Defined in": the source files and lines behind a page, from its `source` metadata. -->
<script lang="ts">
	import type { ReferenceSource } from './metadata.js';

	let { sources }: { sources: readonly ReferenceSource[] } = $props();
	const uid = $props.id();
</script>

<section class="sources" aria-labelledby="{uid}-heading">
	<h2 id="{uid}-heading" class="sv-label">Defined in</h2>
	<ul>
		{#each sources as source (source.href)}
			<li><a href={source.href} rel="external">{source.label}</a></li>
		{/each}
	</ul>
</section>

<style>
	.sources {
		margin-block-start: var(--sv-space-6);
		padding-block-start: var(--sv-space-3);
		border-block-start: var(--sv-rule-width) solid var(--sv-rule);
	}

	h2 {
		margin: 0 0 var(--sv-space-1);
	}

	ul {
		display: grid;
		gap: var(--sv-space-1);
		margin: 0;
		padding: 0;
		list-style: none;
		font-size: var(--sv-step--1);
	}

	a {
		color: var(--sv-text);
		font-family: var(--sv-font-mono);
		overflow-wrap: anywhere;
		text-decoration-color: var(--sv-rule-strong);
		text-underline-offset: 0.2em;
	}

	a:hover {
		color: var(--sv-accent-text);
		text-decoration-color: currentColor;
	}
</style>
