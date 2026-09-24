<script lang="ts">
	import type { ContentComponentProps } from '../content-components.js';
	let { href, children }: ContentComponentProps = $props();
</script>

<a data-owner="host" {href}>{@render children?.()}</a>
