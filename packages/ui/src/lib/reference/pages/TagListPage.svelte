<script lang="ts">
	import { count } from '../../listing.js';
	import type { ThemePageProps } from '../../runtime/theme-props.js';
	import PageTitle from './PageTitle.svelte';

	let { vault }: ThemePageProps = $props();
</script>

<PageTitle title="Tags" />
<ul class="tags">
	{#each vault.tags as tag (tag.slug)}
		<li><a class="sv-tag" href={tag.href}>{tag.title}</a> <span class="sv-label">{count(tag.noteCount, 'page')}</span></li>
	{/each}
</ul>

<style>
	.tags {
		display: flex;
		flex-wrap: wrap;
		gap: var(--sv-space-3) var(--sv-space-5);
		margin: 0;
		padding: 0;
		list-style: none;
	}
</style>
