<!-- Pages grouped under their first letter, flowing into columns, like a category page. -->
<script lang="ts">
	import type { IndexEntry } from '@svartz/core';
	import { alphabetical } from '../wiki.js';

	let { notes }: { notes: readonly IndexEntry[] } = $props();

	const groups = $derived(alphabetical(notes));
</script>

<div class="az">
	{#each groups as group (group.letter)}
		<section class="group" aria-label={group.letter === '#' ? 'Numbers and symbols' : group.letter}>
			<h2>{group.letter}</h2>
			<ul>
				{#each group.entries as note (note.slug)}<li><a href={note.href} data-sv-internal>{note.title}</a></li>{/each}
			</ul>
		</section>
	{/each}
</div>

<style>
	.az {
		columns: 14rem 3;
		column-gap: var(--sv-space-6);
	}

	.group {
		break-inside: avoid;
		margin-block-end: var(--sv-space-4);
	}

	h2 {
		margin: 0 0 var(--sv-space-1);
		color: var(--sv-ink);
		font-size: var(--sv-step-1);
		font-weight: 700;
	}

	ul {
		margin: 0;
		padding-inline-start: 1.1em;
	}

	li {
		margin-block: 0.15rem;
	}

	a {
		color: var(--sv-ink);
		text-decoration-color: var(--sv-rule-strong);
		text-underline-offset: 0.2em;
	}

	a:hover {
		color: var(--sv-accent-text);
		text-decoration-color: var(--sv-accent);
	}
</style>
