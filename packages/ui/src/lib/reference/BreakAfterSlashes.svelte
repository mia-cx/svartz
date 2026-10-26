<!-- Text that may wrap after each `/`, so long paths break between segments instead of mid-word. -->
<script lang="ts">
	let { text }: { text: string } = $props();

	const parts = $derived(text.split(/(?<=\/)/));
</script>

{#each parts as part, index (index)}{#if index > 0}<wbr />{/if}{part}{/each}
