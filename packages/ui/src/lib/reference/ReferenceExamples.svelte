<!-- A reference page's right column: the claiming renderer's examples. -->
<script lang="ts">
	import { referenceContext, type ReferenceShellProps } from './renderers.js';

	let { shell, data, entry }: ReferenceShellProps = $props();

	const Examples = $derived(shell.page?.renderer?.source?.examples);
	const context = $derived(referenceContext(shell, entry));
</script>

{#if Examples}
	<div class="sv-reference-examples" aria-label="Examples" role="region">
		<Examples {data} {context} />
	</div>
{/if}
