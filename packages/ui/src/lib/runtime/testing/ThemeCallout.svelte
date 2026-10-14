<script lang="ts">
	import type { ContentComponentProps } from '../content-components.js';
	let { title, children }: ContentComponentProps = $props();
</script>

<div data-owner="theme" data-callout="note">{title}{@render children?.()}</div>
