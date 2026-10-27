<!-- Minimal's right column on a note: the local graph, the contents, and backlinks, each when the theme keeps it. -->
<script lang="ts">
	import { tagHrefFor } from '@svartz/ui';
	import Backlinks from '../components/Backlinks.svelte';
	import Graph from '../components/Graph.svelte';
	import Toc from '../components/Toc.svelte';
	import type { RegionProps } from '../extension.js';

	let { shell }: RegionProps = $props();

	const backlinks = $derived(shell.entry ? (shell.vault.note(shell.entry.slug)?.backlinks ?? []) : []);
</script>

{#if shell.entry}
	{#if shell.chrome.graph}
		<Graph input={{ notes: shell.vault.entries, links: shell.vault.graph, tagHref: tagHrefFor(shell.vault) }} center={shell.entry.slug} />
	{/if}
	{#if shell.toc.length > 0}<div class="toc"><Toc items={shell.toc} /></div>{/if}
	{#if shell.chrome.backlinks}<Backlinks notes={backlinks} />{/if}
{/if}
