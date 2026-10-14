<script lang="ts">
	import type { Snippet } from 'svelte';
	let { children }: { children?: Snippet } = $props();
</script>

<div>THEME LAYOUT</div>
{@render children?.()}
