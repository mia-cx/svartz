<!-- Notes that link here. Hidden when there are none. -->
<script lang="ts">
	import type { IndexEntry } from '@svartz/core';

	let { notes }: { notes: readonly IndexEntry[] } = $props();
</script>

{#if notes.length > 0}
	<section class="backlinks" aria-labelledby="backlinks-heading">
		<h2 id="backlinks-heading" class="sv-section-title">Backlinks</h2>
		<ul>
			{#each notes as note (note.slug)}
				<li><a href={note.href} data-sv-internal>{note.title}</a></li>
			{/each}
		</ul>
	</section>
{/if}

<style>
	.backlinks {
		font-size: var(--sv-step--1);
	}

	h2 {
		margin: 0 0 var(--sv-space-2);
	}

	ul {
		display: grid;
		gap: var(--sv-space-1);
		margin: 0;
		padding: 0;
		list-style: none;
	}

	a {
		color: var(--sv-text);
		text-decoration: none;
	}

	a:hover {
		color: var(--sv-accent-text);
	}
</style>
