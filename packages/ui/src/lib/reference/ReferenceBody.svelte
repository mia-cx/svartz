<!-- A reference page's main column: the claiming renderer's page, with the context it reads `$ref`s from. -->
<script lang="ts">
	import { referenceContext, type ReferenceShellProps } from './renderers.js';

	let { shell, data, entry, children }: ReferenceShellProps = $props();

	const Page = $derived(shell.page?.renderer?.source?.page);
	const context = $derived(referenceContext(shell, entry));
</script>

{#if Page}
	<article class="sv-reference-page" data-sv-preview>
		<Page {data} {context}>{@render children()}</Page>
	</article>
{/if}
