<script lang="ts">
	import type { ContentComponentProps } from '../content-components.js';
	let { children }: ContentComponentProps = $props();
</script>

<div data-owner="theme" data-embed>{@render children?.()}</div>
