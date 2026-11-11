<!-- A theme layout with both action regions, placed the way theme-minimal places them. -->
<script lang="ts">
	import PageActions from '../../PageActions.svelte';
	import SiteActions from '../../SiteActions.svelte';
	import type { ThemePageProps } from '../theme-props.js';

	let { entry, children }: ThemePageProps = $props();
</script>

<aside><SiteActions /></aside>
<main>
	{#if entry}<header><h1>{entry.title}</h1><PageActions href={entry.markdownHref} /></header>{/if}
	{@render children?.()}
</main>
