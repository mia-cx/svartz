<!--
	Highlighted code block. Wraps rehype-pretty-code's figure (or a bare <pre>)
	and adds a copy button. prose.css labels the language from `data-language`.
-->
<script lang="ts">
	import { Check, Copy } from '@lucide/svelte';
	import type { ContentComponentProps } from '../runtime/content-components.js';

	let { tag, attributes, text, children }: ContentComponentProps = $props();
	// `attributes` belong to the figure; a bare <pre> arrives whole in `children`.

	const COPIED_MS = 1600;
	let block = $state<HTMLElement>();
	let copied = $state(false);

	async function copy() {
		const source = block?.querySelector('code')?.innerText ?? text;
		await navigator.clipboard.writeText(source.replace(/\n$/, ''));
		copied = true;
		setTimeout(() => (copied = false), COPIED_MS);
	}
</script>

{#snippet copyButton()}
	<button
		class="sv-code-copy sv-icon-button"
		type="button"
		onclick={copy}
		aria-label={copied ? 'Copied' : 'Copy code'}
	>
		{#if copied}<Check aria-hidden="true" />{:else}<Copy aria-hidden="true" />{/if}
	</button>
{/snippet}

{#if tag === 'pre'}
	<!-- The pipeline passes the literal <pre> as children, so whitespace survives. -->
	<div class="sv-code" bind:this={block}>
		{@render copyButton()}
		{@render children?.()}
	</div>
{:else}
	<svelte:element this={tag} {...attributes} class="sv-code" bind:this={block}>
		{@render copyButton()}
		{@render children?.()}
	</svelte:element>
{/if}
