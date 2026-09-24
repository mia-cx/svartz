<script lang="ts">
	import type { ThemePageProps } from '@svartz/ui';
	import ListHeader from '../components/ListHeader.svelte';

	let { vault }: ThemePageProps = $props();
</script>

<ListHeader title="404" />
<p class="lead">This page is private, was renamed, or doesn’t exist.</p>
<p class="lead"><a href="{vault.routes.mountPath}/">Return to the home page</a></p>

<style>
	.lead {
		max-inline-size: 34rem;
		margin: 0 0 var(--sv-space-3);
		color: var(--sv-text);
		font-size: var(--sv-step-1);
	}

	a {
		color: var(--sv-ink);
		text-decoration-line: underline;
		text-decoration-color: var(--sv-accent);
		text-decoration-thickness: 1.5px;
		text-underline-offset: 0.2em;
	}

	a:hover {
		color: var(--sv-accent-text);
	}
</style>
