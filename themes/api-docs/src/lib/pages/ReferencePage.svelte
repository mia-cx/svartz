<!-- Every resource with its operations, one section each. -->
<script lang="ts">
	import type { ThemePageProps } from '@svartz/ui';
	import EndpointList from '../components/EndpointList.svelte';
	import PageTitle from '../components/PageTitle.svelte';
	import { apiNav } from '../api.js';

	let { vault }: ThemePageProps = $props();

	const sections = $derived(apiNav(vault.entries, vault.folders).filter((section) => section.reference));
</script>

<PageTitle title="API reference" summary="Every resource, its objects, and its operations." />
{#each sections as section (section.slug)}
	<section aria-labelledby="resource-{section.slug || 'overview'}">
		<h2 id="resource-{section.slug || 'overview'}">
			{#if section.href}<a href={section.href}>{section.title}</a>{:else}{section.title}{/if}
		</h2>
		<EndpointList entries={section.entries} />
	</section>
{/each}

<style>
	section + section {
		margin-block-start: var(--sv-space-6);
	}

	h2 {
		margin: 0 0 var(--sv-space-1);
		color: var(--sv-ink);
		font-size: var(--sv-step-1);
		font-weight: 700;
	}

	h2 a {
		color: inherit;
		text-decoration: none;
	}
</style>
