<!-- The front page. A home note replaces the site's name and description as the introduction above the posts. -->
<script lang="ts">
	import type { ThemePageProps } from '@svartz/ui';
	import BlogHome from '../components/BlogHome.svelte';

	let { vault, site, entry, children }: ThemePageProps = $props();
</script>

{#if entry}<div class="front-note sv-prose">{@render children?.()}</div>{/if}
<BlogHome {vault} {site} intro={!entry} />

<style>
	.front-note {
		margin: var(--sv-space-6) auto;
	}
</style>
