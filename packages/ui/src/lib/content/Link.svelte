<!--
	Every <a> in rendered note content. Internal links get `data-sv-internal`,
	which link previews listen for; external links open in the same tab, like
	any other link, and carry an arrow so readers know they leave the site.
-->
<script lang="ts">
	import ArrowUpRight from '@lucide/svelte/icons/arrow-up-right';
	import LinkIcon from '@lucide/svelte/icons/link';
	import type { ContentComponentProps } from '../runtime/content-components.js';
	import { classifyLink } from './links.js';

	let { href, attributes, children }: ContentComponentProps = $props();

	const kind = $derived(classifyLink(href, attributes));
	const className = $derived(
		[attributes.class, kind === 'heading-anchor' ? undefined : `sv-link sv-link-${kind}`]
			.filter(Boolean)
			.join(' ')
	);
</script>

{#if kind === 'heading-anchor'}
	<a {...attributes} {href} class={className} aria-label="Link to this section">
		<LinkIcon size="0.8em" strokeWidth={2} aria-hidden="true" />
	</a>
{:else}
	<a
		{...attributes}
		{href}
		class={className}
		data-sv-internal={kind === 'internal' ? '' : undefined}
		rel={kind === 'external' ? 'noopener' : String(attributes.rel ?? '') || undefined}
		>{@render children?.()}{#if kind === 'external'}<ArrowUpRight
				class="sv-link-external-icon"
				size="0.8em"
				strokeWidth={2}
				aria-hidden="true"
			/>{/if}</a
	>
{/if}
