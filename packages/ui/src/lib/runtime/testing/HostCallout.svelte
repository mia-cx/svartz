<script lang="ts">
	import type { ContentComponentProps } from '../content-components.js';
	let { title, children }: ContentComponentProps = $props();
</script>

<div data-owner="host" data-callout="note">{title}{@render children?.()}</div>
