<!--
	A kind badge: an HTTP method, GraphQL kind, `TOOL`, or `SCHEMA`. `fixed`
	gives every badge one width, so labels beside a column of badges line up.
	The text always shows; the colour only repeats it.
-->
<script lang="ts">
	import type { ReferenceBadge } from './renderers.js';

	let { badge, fixed = false }: { badge: ReferenceBadge; fixed?: boolean } = $props();

	const signal = $derived(badge.hue !== 'neutral');
</script>

<span
	class="sv-badge sv-reference-badge"
	class:fixed
	class:neutral={!signal}
	data-sv-signal={signal ? '' : undefined}
	style:--sv-hue={signal ? `var(--sv-hue-${badge.hue})` : undefined}>{badge.label}</span
>

<style>
	.sv-reference-badge {
		flex: none;
		justify-content: center;
		font-family: var(--sv-font-mono);
		letter-spacing: 0.02em;
	}

	/* Eight monospace characters: OPTIONS, MUTATION, and SCHEMA all fit. */
	.fixed {
		box-sizing: content-box;
		inline-size: 8ch;
		padding-inline: 0.3em;
		font-size: 0.62rem;
	}

	.neutral {
		background: var(--sv-surface);
		color: var(--sv-muted);
		box-shadow: inset 0 0 0 var(--sv-rule-width) var(--sv-rule);
	}
</style>
