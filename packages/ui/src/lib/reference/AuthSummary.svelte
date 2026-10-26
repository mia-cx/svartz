<!-- How a call authenticates: the scheme, what to send, and the scopes it needs. -->
<script lang="ts">
	import type { IndexEntry } from '@svartz/core';
	import DescText from '../DescText.svelte';
	import { authLabel, type ReferenceAuth } from './metadata.js';

	let { auth, entries }: { auth: ReferenceAuth; entries: readonly IndexEntry[] } = $props();
</script>

<div class="auth">
	<span class="sv-label">Auth</span>
	<div class="detail">
		{#if auth.scheme}<strong>{authLabel(auth.scheme)}</strong>{/if}
		{#if auth.description}<span><DescText value={auth.description} {entries} /></span>{/if}
		{#if auth.scopes.length > 0}
			<span class="scopes">
				<span class="sv-label">Scopes</span>
				{#each auth.scopes as scope (scope)}<code>{scope}</code>{/each}
			</span>
		{/if}
	</div>
</div>

<style>
	.auth {
		display: flex;
		align-items: baseline;
		gap: var(--sv-space-3);
		margin: var(--sv-space-3) 0 0;
		font-size: var(--sv-step--1);
	}

	.detail {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: var(--sv-space-1) var(--sv-space-3);
		min-inline-size: 0;
		color: var(--sv-text);
	}

	strong {
		color: var(--sv-ink);
		font-weight: 600;
	}

	.scopes {
		display: inline-flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: var(--sv-space-1);
	}

	code {
		padding: 0 0.35em;
		border-radius: var(--sv-radius-s);
		background: var(--sv-surface);
		color: var(--sv-ink);
		font-family: var(--sv-font-mono);
		font-size: 0.92em;
	}
</style>
