<!--
	A titled code panel with tabs (languages or status codes) and a copy button.
	`remember` keeps the chosen tab across pages, so readers pick their language once.
-->
<script lang="ts">
	import Check from '@lucide/svelte/icons/check';
	import Copy from '@lucide/svelte/icons/copy';
	import { onMount } from 'svelte';

	let {
		title,
		tabs,
		remember
	}: { title: string; tabs: readonly { id: string; label: string; code: string }[]; remember?: string } = $props();

	const COPIED_MS = 1600;
	let active = $state(0);
	let copied = $state(false);
	const current = $derived(tabs[Math.min(active, tabs.length - 1)]);

	onMount(() => {
		if (!remember) return;
		const saved = localStorage.getItem(remember);
		const index = tabs.findIndex((tab) => tab.id === saved);
		if (index >= 0) active = index;
	});

	function choose(index: number) {
		active = index;
		if (remember) localStorage.setItem(remember, tabs[index]!.id);
	}

	async function copy() {
		if (!current) return;
		await navigator.clipboard.writeText(current.code);
		copied = true;
		setTimeout(() => (copied = false), COPIED_MS);
	}
</script>

{#if current}
	<figure class="panel">
		<figcaption>
			<span class="sv-label">{title}</span>
			{#if tabs.length > 1}
				<span class="tabs" role="tablist" aria-label={title}>
					{#each tabs as tab, index (tab.id)}
						<button type="button" role="tab" aria-selected={index === active} onclick={() => choose(index)}>{tab.label}</button>
					{/each}
				</span>
			{:else}
				<span class="single">{current.label}</span>
			{/if}
			<button class="sv-icon-button copy" type="button" onclick={copy} aria-label={copied ? 'Copied' : `Copy ${title.toLowerCase()}`}>
				{#if copied}<Check aria-hidden="true" />{:else}<Copy aria-hidden="true" />{/if}
			</button>
		</figcaption>
		<pre role={tabs.length > 1 ? 'tabpanel' : undefined}><code>{current.code}</code></pre>
	</figure>
{/if}

<style>
	.panel {
		margin: 0 0 var(--sv-space-4);
		overflow: hidden;
		border: var(--sv-rule-width) solid var(--sv-rule);
		border-radius: var(--sv-radius-m);
		background: var(--sv-sunken);
	}

	figcaption {
		display: flex;
		align-items: center;
		gap: var(--sv-space-3);
		padding: var(--sv-space-1) var(--sv-space-1) var(--sv-space-1) var(--sv-space-3);
		border-block-end: var(--sv-rule-width) solid var(--sv-rule);
		background: var(--sv-surface);
	}

	.tabs {
		display: flex;
		flex: 1;
		gap: 2px;
		overflow-x: auto;
	}

	.single {
		flex: 1;
		color: var(--sv-muted);
		font-family: var(--sv-font-mono);
		font-size: 0.78rem;
	}

	button[role='tab'] {
		padding: var(--sv-space-1) var(--sv-space-2);
		border: 0;
		border-radius: var(--sv-radius-s);
		background: none;
		color: var(--sv-muted);
		font: inherit;
		font-size: var(--sv-step--1);
		white-space: nowrap;
		cursor: pointer;
	}

	button[role='tab'][aria-selected='true'] {
		background: var(--sv-paper);
		color: var(--sv-ink);
		font-weight: 600;
		box-shadow: 0 0 0 var(--sv-rule-width) var(--sv-rule);
	}

	.copy {
		inline-size: 1.75rem;
		block-size: 1.75rem;
	}

	.copy :global(svg) {
		inline-size: 0.9rem;
		block-size: 0.9rem;
	}

	pre {
		max-block-size: 28rem;
		margin: 0;
		padding: var(--sv-space-4);
		overflow: auto;
		color: var(--sv-ink);
		font-family: var(--sv-font-mono);
		font-size: 0.8rem;
		line-height: 1.6;
		tab-size: 2;
	}
</style>
