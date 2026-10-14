<script lang="ts">
	import type { ContentComponents } from '../content-components.js';
	let { contentComponents }: { contentComponents: ContentComponents } = $props();
</script>

<contentComponents.callout
	{...{ tag: 'div', attributes: { 'data-callout': 'note' }, text: '', calloutType: 'note', title: 'Heads up' }}
	>Callout body</contentComponents.callout
>
<contentComponents.embed
	{...{ tag: 'div', attributes: { class: 'svartz-embed' }, text: '', target: 'demo' }}
	>Embed body</contentComponents.embed
>
