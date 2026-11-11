<!--
	The article renderer's body, for a note with an `infobox` or a `hatnote`:
	the article head with the page actions beside the title, the hatnote, then
	the note with its infobox floated beside it. Narrow columns put the infobox
	first.
-->
<script lang="ts">
	import '../article.css';
	import type { RendererProps } from '@svartz/theme-minimal/runtime';
	import { assetHref, DescText } from '@svartz/ui';
	import type { Article } from '../wiki.js';
	import ArticleHead from './ArticleHead.svelte';
	import Infobox from './Infobox.svelte';

	let { shell, data, entry, summary, actions, content }: RendererProps<Article> = $props();

	// The pipeline publishes attachments named by top-level `image`, so that is the portable field.
	const imageName = $derived(data.infobox?.image ?? (typeof entry.properties.image === 'string' ? entry.properties.image : undefined));
	const imageSrc = $derived(imageName ? assetHref(shell.vault, entry, imageName) : undefined);
</script>

<div class="article wiki-prose">
	<ArticleHead title={entry.title} site={shell.site.title}>{@render actions()}</ArticleHead>
	{#if data.hatnote}<p class="hatnote"><DescText value={data.hatnote} entries={shell.vault.entries} /></p>{/if}
	{#if data.infobox}<Infobox infobox={data.infobox} title={entry.title} {imageSrc} entries={shell.vault.entries} />{/if}
	{@render summary()}
	{@render content()}
</div>

<style>
	.article {
		container: wiki-article / inline-size;
	}

	.hatnote {
		margin: 0 0 var(--sv-space-4);
		padding-inline-start: var(--sv-space-5);
		color: var(--sv-text);
		font-style: italic;
	}
</style>
