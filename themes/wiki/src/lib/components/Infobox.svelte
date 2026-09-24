<!-- The summary box beside a wiki article, from the note's `infobox` frontmatter. -->
<script lang="ts">
	import type { IndexEntry } from '@svartz/core';
	import { wikilinkSegments, type Infobox } from '../wiki.js';

	let {
		infobox,
		title,
		imageSrc,
		entries
	}: { infobox: Infobox; title: string; imageSrc?: string; entries: readonly IndexEntry[] } = $props();
</script>

<aside class="infobox" aria-label="Summary of {title}">
	<p class="infobox-title">{title}</p>
	{#if imageSrc}
		<figure>
			<img src={imageSrc} alt={infobox.caption ?? ''} />
			{#if infobox.caption}<figcaption>{infobox.caption}</figcaption>{/if}
		</figure>
	{/if}
	{#each infobox.sections as section, index (index)}
		{#if section.heading}<p class="infobox-section sv-label">{section.heading}</p>{/if}
		<dl>
			{#each section.rows as [label, value] (label)}
				<dt>{label}</dt>
				<dd>
					{#each wikilinkSegments(value, entries) as segment, index (index)}
						{#if segment.href}<a href={segment.href} data-sv-internal>{segment.text}</a>{:else}{segment.text}{/if}
					{/each}
				</dd>
			{/each}
		</dl>
	{/each}
</aside>

<style>
	.infobox {
		float: inline-end;
		clear: inline-end;
		inline-size: min(20rem, 42%);
		margin: 0 0 var(--sv-space-4) var(--sv-space-5);
		padding: var(--sv-space-3);
		border: var(--sv-rule-width) solid var(--sv-rule);
		border-radius: var(--sv-radius-m);
		background: var(--sv-surface);
		font-size: var(--sv-step--1);
		line-height: 1.45;
	}

	.infobox-title {
		margin: 0 0 var(--sv-space-2);
		color: var(--sv-ink);
		font-size: var(--sv-step-1);
		font-weight: 700;
		text-align: center;
	}

	figure {
		margin: 0 0 var(--sv-space-3);
	}

	img {
		display: block;
		inline-size: 100%;
		block-size: auto;
		border-radius: var(--sv-radius-s);
	}

	figcaption {
		margin-block-start: var(--sv-space-1);
		color: var(--sv-muted);
		text-align: center;
	}

	.infobox-section {
		margin: var(--sv-space-3) 0 var(--sv-space-1);
		padding: var(--sv-space-1) var(--sv-space-2);
		border-radius: var(--sv-radius-s);
		background: var(--sv-sunken);
		text-align: center;
	}

	dl {
		display: grid;
		grid-template-columns: minmax(5rem, auto) 1fr;
		gap: var(--sv-space-1) var(--sv-space-3);
		margin: 0;
	}

	dt {
		color: var(--sv-ink);
		font-weight: 600;
	}

	dd {
		margin: 0;
	}

	dd a {
		color: var(--sv-ink);
		text-decoration-color: var(--sv-accent);
		text-underline-offset: 0.2em;
	}

	/* Narrow columns: the infobox leads the article instead of floating beside it. */
	@container wiki-article (max-width: 36rem) {
		.infobox {
			float: none;
			inline-size: auto;
			margin: 0 0 var(--sv-space-5);
		}
	}
</style>
