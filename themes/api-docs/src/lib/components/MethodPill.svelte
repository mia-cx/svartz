<!-- An HTTP method or GraphQL operation kind as a fixed-width signal badge. -->
<script lang="ts">
	import { GRAPHQL_KINDS, HTTP_METHODS, type ApiOperation } from '../api.js';

	let { operation, compact = false }: { operation: ApiOperation; compact?: boolean } = $props();

	const label = $derived(operation.protocol === 'rest' ? operation.method : operation.kind);
	const hue = $derived(
		operation.protocol === 'rest' ? HTTP_METHODS[operation.method] : GRAPHQL_KINDS[operation.kind]
	);
	const short = $derived(compact ? (operation.protocol === 'rest' ? label.replace('DELETE', 'DEL').replace('OPTIONS', 'OPT') : label.slice(0, 3)) : label);
</script>

<span class="sv-badge pill" class:compact data-sv-signal style:--sv-hue="var(--sv-hue-{hue})" title={compact ? label : undefined}>{short}</span>

<style>
	.pill {
		justify-content: center;
		min-inline-size: 3.6em;
	}

	.compact {
		min-inline-size: 3em;
		font-size: 0.62rem;
	}
</style>
