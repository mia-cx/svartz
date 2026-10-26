<!-- What a reference page documents, in one copyable line: a badge, then a path or name. -->
<script lang="ts">
	import Check from '@lucide/svelte/icons/check';
	import Copy from '@lucide/svelte/icons/copy';
	import Badge from './Badge.svelte';
	import type { ReferenceBadge } from './renderers.js';

	let { badge, code, copyLabel }: { badge: ReferenceBadge; code: string; copyLabel: string } = $props();

	const COPIED_MS = 1600;
	let copied = $state(false);

	async function copy() {
		await navigator.clipboard.writeText(code);
		copied = true;
		setTimeout(() => (copied = false), COPIED_MS);
	}
</script>

<div class="endpoint">
	<Badge {badge} />
	<code>{code}</code>
	<button class="sv-icon-button" type="button" onclick={copy} aria-label={copied ? 'Copied' : copyLabel}>
		{#if copied}<Check aria-hidden="true" />{:else}<Copy aria-hidden="true" />{/if}
	</button>
</div>

<style>
	.endpoint {
		display: flex;
		align-items: center;
		gap: var(--sv-space-3);
		padding: var(--sv-space-2) var(--sv-space-2) var(--sv-space-2) var(--sv-space-3);
		border: var(--sv-rule-width) solid var(--sv-rule);
		border-radius: var(--sv-radius-m);
		background: var(--sv-surface);
	}

	code {
		flex: 1;
		min-inline-size: 0;
		color: var(--sv-ink);
		font-family: var(--sv-font-mono);
		font-size: 0.92rem;
		overflow-wrap: anywhere;
	}

	button {
		flex: none;
	}
</style>
