<script lang="ts">
	import type { ThemePageProps } from '@svartz/ui';
	import PageTitle from '../components/PageTitle.svelte';

	let { vault }: ThemePageProps = $props();
</script>

<PageTitle title="Page not found" summary="This page may have moved in a newer version. Try the search, or start from the overview." />
<p><a href="{vault.routes.mountPath}/">Back to the overview</a></p>

<style>
	a {
		color: var(--sv-ink);
		font-weight: 600;
		text-decoration-color: var(--sv-accent);
		text-underline-offset: 0.2em;
	}
</style>
