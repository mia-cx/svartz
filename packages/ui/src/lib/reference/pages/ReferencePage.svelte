<!-- Every reference section with its pages, one list each. -->
<script lang="ts">
	import EntryList from './EntryList.svelte';
	import PageTitle from './PageTitle.svelte';
	import { getReferenceShell } from '../context.js';
	import { navLinks } from '../nav.js';

	const shell = getReferenceShell();
	const sections = $derived(shell.sections.filter((section) => section.reference));
</script>

<PageTitle title="Reference" summary="Every schema, operation, and tool." />
{#each sections as section (section.slug)}
	<section aria-labelledby="section-{section.slug || 'overview'}">
		<h2 id="section-{section.slug || 'overview'}">
			{#if section.href}<a href={section.href}>{section.title}</a>{:else}{section.title}{/if}
		</h2>
		<EntryList entries={navLinks([section]).map((link) => link.entry)} />
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
