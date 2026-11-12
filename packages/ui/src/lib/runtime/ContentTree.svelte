<!-- @component
Renders an inert HTML tree in the browser as the build compiles a note: each callout, code
block, image, link and embed through `components`, everything else as plain elements, with
the build's sanitizing. `insideCode` is set below a code block's figure, whose `<pre>` is its own.
-->
<script lang="ts">
	import type { ElementContent, RootContent } from 'hast';
	import {
		activeContentSlot,
		containsCode,
		contentProps,
		isUnsafeElement,
		safeAttributes,
		VOID_TAGS
	} from '@svartz/plugins/content';
	import type { ContentComponents } from './content-components.js';
	import ContentTree from './ContentTree.svelte';

	let {
		nodes,
		components,
		insideCode = false
	}: {
		nodes: readonly (RootContent | ElementContent)[];
		components: ContentComponents;
		insideCode?: boolean;
	} = $props();
</script>

{#each nodes as node (node)}
	{#if node.type === 'text'}{node.value}{:else if node.type === 'element' && !isUnsafeElement(node)}
		{@const slot = activeContentSlot(node, insideCode)}
		{@const attributes = safeAttributes(node)}
		{@const childrenInsideCode = containsCode(node, insideCode)}
		{#if slot}
			{@const Slot = components[slot]}
			{#if VOID_TAGS.has(node.tagName)}
				<Slot {...contentProps(node, slot)} />
			{:else if slot === 'codeBlock' && node.tagName === 'pre'}
				<!-- As compiled notes do, the slot gets the literal <pre> as children. -->
				<Slot {...contentProps(node, slot)}
					><pre {...attributes}><ContentTree
							nodes={node.children}
							{components}
							insideCode={childrenInsideCode}
						/></pre></Slot
				>
			{:else}
				<Slot {...contentProps(node, slot)}
					><ContentTree nodes={node.children} {components} insideCode={childrenInsideCode} /></Slot
				>
			{/if}
		{:else if VOID_TAGS.has(node.tagName)}
			<svelte:element this={node.tagName} {...attributes} />
		{:else}
			<svelte:element this={node.tagName} {...attributes}
				><ContentTree nodes={node.children} {components} insideCode={childrenInsideCode} /></svelte:element
			>
		{/if}
	{/if}
{/each}
