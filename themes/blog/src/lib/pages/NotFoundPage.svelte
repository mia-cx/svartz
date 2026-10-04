<script lang="ts">
	import type { ThemePageProps } from '@svartz/ui';
	import PageHeader from '../components/PageHeader.svelte';

	let { vault }: ThemePageProps = $props();
</script>

<PageHeader label="404" title="Page not found" summary="This post may have moved, or never existed." />
<p class="home"><a href="{vault.routes.mountPath}/">Back to the latest posts</a></p>

<style>
	.home {
		text-align: center;
	}

	a {
		color: var(--sv-ink);
		font-weight: 600;
		text-decoration-color: var(--sv-accent);
		text-underline-offset: 0.2em;
	}
</style>
