<script lang="ts">
	import type { ThemePageProps } from '@svartz/ui';
	import PageTitle from '../components/PageTitle.svelte';

	let { vault }: ThemePageProps = $props();
</script>

<PageTitle title="Page not found" />
<p>This wiki has no page at this address. It may be private, renamed, or not written yet.</p>
<p><a href="{vault.routes.mountPath}/">Return to the main page</a></p>

<style>
	p {
		margin: 0 0 var(--sv-space-3);
	}

	a {
		color: var(--sv-ink);
		text-decoration-color: var(--sv-accent);
		text-underline-offset: 0.2em;
	}
</style>
