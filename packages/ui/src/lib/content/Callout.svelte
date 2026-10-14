<!--
	Obsidian callout. The pipeline hands over the blockquote body, including the
	marker span and bold title, which prose.css hides. Foldable callouts use
	<details>, so they open and close without JavaScript.
-->
<script lang="ts">
	import type { ContentComponentProps } from '../runtime/content-components.js';
	import { resolveCallout } from './callouts.js';
	import CalloutIcon from './CalloutIcon.svelte';
	import ChevronDown from '@lucide/svelte/icons/chevron-down';

	let { calloutType = 'note', title, fold, children }: ContentComponentProps = $props();

	const callout = $derived(resolveCallout(calloutType, title));
	const hue = $derived(callout.hue === 'neutral' ? undefined : `var(--sv-hue-${callout.hue})`);
</script>

{#snippet heading()}
	<span class="sv-callout-icon" aria-hidden="true"><CalloutIcon icon={callout.icon} /></span>
	<span class="sv-callout-title-text">{callout.title}</span>
{/snippet}

{#if fold}
	<details
		class="sv-callout"
		data-sv-signal
		data-callout={callout.type}
		data-neutral={hue ? undefined : ''}
		style:--sv-hue={hue}
		open={fold === 'open'}
	>
		<summary class="sv-callout-title">
			{@render heading()}
			<ChevronDown class="sv-callout-fold" aria-hidden="true" />
		</summary>
		<div class="sv-callout-body">{@render children?.()}</div>
	</details>
{:else}
	<div
		class="sv-callout"
		data-sv-signal
		data-callout={callout.type}
		data-neutral={hue ? undefined : ''}
		style:--sv-hue={hue}
	>
		<p class="sv-callout-title">{@render heading()}</p>
		<div class="sv-callout-body">{@render children?.()}</div>
	</div>
{/if}
