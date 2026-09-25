<script lang="ts">
	import type { ContentComponentProps } from './content-components.js';

	let { tag, attributes, children }: ContentComponentProps = $props();
	const voidElement = $derived(['img', 'input', 'source', 'br', 'hr'].includes(tag));
</script>

{#if voidElement}
	<svelte:element this={tag} {...attributes} />
{:else if tag === 'pre'}
	<!-- A code block's <pre> arrives whole in `children`. -->
	{@render children?.()}
{:else}
	<svelte:element this={tag} {...attributes}>{@render children?.()}</svelte:element>
{/if}
