<!-- @component
Renders an inert HTML tree in the browser as the build compiles a note: each callout, code
block, image, link and embed through `components`, everything else as plain elements, with
the build's sanitizing. `insideCode` is set below a code block's figure, whose `<pre>` is its own.
`namespace` is the parent's: `<svg>` and `<math>` start their own, and the HTML parser's integration
points (`<foreignObject>`, `<mtext>` and the like) return their children to HTML.
-->
<script module lang="ts">
	const HTML = 'http://www.w3.org/1999/xhtml';
	const SVG = 'http://www.w3.org/2000/svg';
	const MATHML = 'http://www.w3.org/1998/Math/MathML';
	const ROOTS: Record<string, string> = { svg: SVG, math: MATHML };
	/** Elements whose children the HTML parser puts back in HTML, per namespace. */
	const INTEGRATION_POINTS: Record<string, ReadonlySet<string>> = {
		[SVG]: new Set(['foreignObject', 'desc', 'title']),
		[MATHML]: new Set(['mi', 'mo', 'mn', 'ms', 'mtext'])
	};
	const HTML_ENCODINGS = new Set(['text/html', 'application/xhtml+xml']);
</script>

<script lang="ts">
	import type { Element, ElementContent, RootContent } from 'hast';
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
		insideCode = false,
		namespace = HTML
	}: {
		nodes: readonly (RootContent | ElementContent)[];
		components: ContentComponents;
		insideCode?: boolean;
		namespace?: string;
	} = $props();

	// Svelte creates a dynamic element in HTML unless told otherwise, so an SVG shape would never draw.
	const namespaceOf = (node: Element) => ROOTS[node.tagName] ?? namespace;
	function childNamespace(node: Element): string {
		const own = namespaceOf(node);
		const encoding = String(node.properties.encoding ?? '').toLowerCase();
		const html =
			INTEGRATION_POINTS[own]?.has(node.tagName) ||
			(own === MATHML && node.tagName === 'annotation-xml' && HTML_ENCODINGS.has(encoding));
		return html ? HTML : own;
	}
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
			<svelte:element this={node.tagName} xmlns={namespaceOf(node)} {...attributes} />
		{:else}
			<svelte:element this={node.tagName} xmlns={namespaceOf(node)} {...attributes}
				><ContentTree
					nodes={node.children}
					{components}
					insideCode={childrenInsideCode}
					namespace={childNamespace(node)}
				/></svelte:element
			>
		{/if}
	{/if}
{/each}
