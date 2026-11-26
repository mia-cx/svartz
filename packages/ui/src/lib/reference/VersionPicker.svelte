<!--
	The version the reader is on, opening a list of every version. Each keeps the reader on the same page, or lands on
	that version's home page when it has no such page. A native disclosure, so it opens without JavaScript; with it,
	Escape, a click outside, and leaving it by keyboard close it.
-->
<script lang="ts">
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import Check from '@lucide/svelte/icons/check';
	import type { VersionLink } from './versions.js';

	let { versions }: { versions: readonly VersionLink[] } = $props();

	let picker: HTMLDetailsElement | undefined = $state();
	const current = $derived(versions.find((version) => version.current)!);
	const STATUS_LABELS = { latest: 'Latest', supported: undefined, deprecated: 'Deprecated' } as const;

	// The element is the state: its native toggle, not a bound copy, says whether it's open.
	const close = () => picker && (picker.open = false);

	function onkeydown(event: KeyboardEvent) {
		if (event.key !== 'Escape' || !picker?.open) return;
		event.stopPropagation();
		close();
		picker.querySelector('summary')?.focus();
	}

	function onfocusout(event: FocusEvent) {
		if (!picker?.contains(event.relatedTarget as Node | null)) close();
	}

	function onpointerdown(event: PointerEvent) {
		if (!picker?.contains(event.target as Node)) close();
	}
</script>

<svelte:document {onpointerdown} {onkeydown} />

<details class="version-picker" bind:this={picker} {onfocusout}>
	<summary data-sv-signal style:--sv-hue="var(--sv-hue-green)">
		<span class="sv-visually-hidden">Version </span>{current.id}<ChevronDown aria-hidden="true" />
	</summary>
	<ul class="versions">
		{#each versions as version (version.id)}
			{@const status = STATUS_LABELS[version.status]}
			<li>
				<a href={version.href} aria-current={version.current ? 'true' : undefined} onclick={close}>
					<span class="id">{version.id}</span>
					{#if status}<span class="sv-label">{status}</span>{/if}
					{#if version.current}<Check aria-hidden="true" />{/if}
				</a>
			</li>
		{/each}
	</ul>
</details>

<style>
	.version-picker {
		position: relative;
	}

	summary {
		display: inline-flex;
		align-items: center;
		gap: 0.2em;
		padding: 0.15em 0.3em 0.15em 0.5em;
		border-radius: var(--sv-radius-s);
		background: var(--sv-signal-soft);
		color: var(--sv-signal);
		font-size: var(--sv-label-size);
		font-weight: 700;
		line-height: 1.5;
		white-space: nowrap;
		list-style: none;
		cursor: pointer;
	}

	summary::-webkit-details-marker {
		display: none;
	}

	summary :global(svg) {
		inline-size: 1.1em;
		block-size: 1.1em;
		transition: rotate var(--sv-duration) var(--sv-ease);
	}

	.version-picker[open] summary :global(svg) {
		rotate: 180deg;
	}

	.versions {
		position: absolute;
		inset-block-start: calc(100% + var(--sv-space-2));
		inset-inline-start: 0;
		z-index: var(--sv-z-popover);
		min-inline-size: 12rem;
		margin: 0;
		padding: var(--sv-space-1);
		border: var(--sv-rule-width) solid var(--sv-rule);
		border-radius: var(--sv-radius-m);
		background: var(--sv-paper);
		box-shadow: var(--sv-shadow);
		list-style: none;
	}

	.versions a {
		display: flex;
		align-items: center;
		gap: var(--sv-space-2);
		padding: var(--sv-space-2) var(--sv-space-3);
		border-radius: var(--sv-radius-s);
		color: var(--sv-text);
		text-decoration: none;
	}

	.versions a:hover {
		background: var(--sv-surface);
		color: var(--sv-ink);
	}

	.versions a[aria-current] {
		color: var(--sv-ink);
		font-weight: 600;
	}

	.id {
		flex: 1;
		white-space: nowrap;
		font-family: var(--sv-font-mono);
		font-size: var(--sv-step--1);
	}

	.versions :global(svg) {
		inline-size: 1rem;
		block-size: 1rem;
		color: var(--sv-accent-text);
	}

	/* On phones the picker sits near the bar's end, so the list opens leftward and stays on screen. */
	@media (max-width: 52rem) {
		.versions {
			inset-inline: auto 0;
		}
	}
</style>
