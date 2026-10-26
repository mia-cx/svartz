<!--
	A titled code panel with tabs (languages, statuses, or examples) and a copy
	button. `remember` keeps the chosen tab across pages, so readers pick their
	language once. Arrow keys move between tabs.
-->
<script lang="ts">
	import Check from '@lucide/svelte/icons/check';
	import Copy from '@lucide/svelte/icons/copy';
	import { onMount } from 'svelte';
	import Badge from './Badge.svelte';
	import type { CodeTab } from './renderers.js';

	let { title, tabs, remember }: { title: string; tabs: readonly CodeTab[]; remember?: string } = $props();

	const COPIED_MS = 1600;
	const uid = $props.id();
	let active = $state(0);
	let copied = $state(false);
	let tabButtons: HTMLButtonElement[] = $state([]);
	const index = $derived(Math.min(active, tabs.length - 1));
	const current = $derived(tabs[index]);

	onMount(() => {
		if (!remember) return;
		const saved = localStorage.getItem(remember);
		const found = tabs.findIndex((tab) => tab.id === saved);
		if (found >= 0) active = found;
	});

	function choose(next: number) {
		active = next;
		if (remember) localStorage.setItem(remember, tabs[next]!.id);
	}

	function onkeydown(event: KeyboardEvent) {
		const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
		const target = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (index + step + tabs.length) % tabs.length;
		if (!step && event.key !== 'Home' && event.key !== 'End') return;
		event.preventDefault();
		choose(target);
		tabButtons[target]?.focus();
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
					{#each tabs as tab, position (tab.id)}
						<button
							bind:this={tabButtons[position]}
							type="button"
							role="tab"
							id="{uid}-tab-{position}"
							aria-selected={position === index}
							aria-controls="{uid}-panel"
							tabindex={position === index ? 0 : -1}
							onclick={() => choose(position)}
							{onkeydown}
						>
							{tab.label}
						</button>
					{/each}
				</span>
			{:else}
				<span class="single">{current.label}</span>
			{/if}
			<button class="sv-icon-button copy" type="button" onclick={copy} aria-label={copied ? 'Copied' : `Copy ${title.toLowerCase()}`}>
				{#if copied}<Check aria-hidden="true" />{:else}<Copy aria-hidden="true" />{/if}
			</button>
		</figcaption>
		<div
			id="{uid}-panel"
			role={tabs.length > 1 ? 'tabpanel' : undefined}
			aria-labelledby={tabs.length > 1 ? `${uid}-tab-${index}` : undefined}
		>
			{#if current.badge || current.caption}
				<p class="caption">
					{#if current.badge}<Badge badge={current.badge} />{/if}
					{#if current.caption}<span>{current.caption}</span>{/if}
				</p>
			{/if}
			<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
			<pre tabindex="0"><code>{current.code}</code></pre>
		</div>
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
		min-inline-size: 0;
		overflow-x: auto;
		scrollbar-width: thin;
	}

	.single {
		flex: 1;
		min-inline-size: 0;
		overflow: hidden;
		color: var(--sv-muted);
		font-family: var(--sv-font-mono);
		font-size: 0.78rem;
		text-overflow: ellipsis;
		white-space: nowrap;
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
		flex: none;
		inline-size: 1.75rem;
		block-size: 1.75rem;
	}

	.copy :global(svg) {
		inline-size: 0.9rem;
		block-size: 0.9rem;
	}

	.caption {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--sv-space-2);
		margin: 0;
		padding: var(--sv-space-2) var(--sv-space-4) 0;
		color: var(--sv-text);
		font-size: var(--sv-step--1);
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
