<!--
	Transcluded notes (`div.svartz-embed`) and media (audio, video, PDF iframes).
	Note embeds keep the pipeline's source link and body; prose.css frames them.
-->
<script lang="ts">
	import type { ContentComponentProps } from '../runtime/content-components.js';

	let { tag, attributes, children }: ContentComponentProps = $props();

	const className = $derived([attributes.class, 'sv-embed'].filter(Boolean).join(' '));
</script>

{#if tag === 'div'}
	<div {...attributes} class={className}>{@render children?.()}</div>
{:else}
	<svelte:element this={tag} {...attributes} class={className}>{@render children?.()}</svelte:element>
{/if}
