<script lang="ts">
	import type { ThemePageProps } from '@svartz/ui';
	import ListHeader from '../components/ListHeader.svelte';

	let { vault }: ThemePageProps = $props();
</script>

<ListHeader label="404" title="This page isn’t here" />
<p class="lead">It may be private, renamed, or never published. Try a search, or start from the <a href="{vault.routes.mountPath}/">home page</a>.</p>

<style>
	.lead {
		max-inline-size: 34rem;
		margin: 0;
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
