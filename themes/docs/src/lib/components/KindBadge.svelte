<!-- A symbol kind as a signal-coloured badge. `short` shows one letter, for the sidebar. -->
<script lang="ts">
	import { SYMBOL_KINDS, type SymbolKind } from '../symbols.js';

	let { kind, short = false }: { kind: SymbolKind; short?: boolean } = $props();
</script>

<span class="sv-badge" class:short data-sv-signal style:--sv-hue="var(--sv-hue-{SYMBOL_KINDS[kind]})" title={short ? kind : undefined}>
	{short ? kind.charAt(0) : kind}
</span>

<style>
	.short {
		justify-content: center;
		inline-size: 1.35em;
		padding-inline: 0;
	}
</style>
