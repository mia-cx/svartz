<!--
	The local link graph, one hop around the current note, with a button that
	opens the whole vault's graph in a dialog.
-->
<script lang="ts">
	import { goto } from '$app/navigation';
	import Maximize2 from '@lucide/svelte/icons/maximize-2';
	import X from '@lucide/svelte/icons/x';
	import { buildGraph, type GraphInput } from '../graph.js';
	import { mountGraph } from '../graph-canvas.js';

	let { input, center }: { input: GraphInput; center: string | undefined } = $props();

	let localCanvas = $state<HTMLCanvasElement>();
	let globalCanvas = $state<HTMLCanvasElement>();
	let dialog = $state<HTMLDialogElement>();
	let expanded = $state(false);

	const open = (href: string) => {
		dialog?.close();
		void goto(href);
	};

	$effect(() => {
		if (!localCanvas) return;
		return mountGraph(localCanvas, buildGraph(input, center, 1), { center, onOpen: open, labelZoom: 1.3 });
	});

	$effect(() => {
		if (!expanded || !globalCanvas) return;
		return mountGraph(globalCanvas, buildGraph(input, center, -1), {
			center,
			radial: true,
			labelZoom: 1.8,
			onOpen: open
		});
	});

	// No keyboard shortcut: Ctrl/⌘+G belongs to the browser's find-next.
	function show() {
		dialog?.showModal();
		expanded = true;
	}
</script>

<section class="graph" aria-labelledby="graph-heading">
	<h2 id="graph-heading" class="sv-section-title graph-title">Graph view</h2>
	<!-- As in Quartz, the full-graph button sits in the box's corner. -->
	<div class="graph-box">
		<canvas bind:this={localCanvas} class="graph-canvas" aria-label="Notes linked to this one"></canvas>
		<button class="sv-icon-button graph-expand" type="button" onclick={show} aria-label="Open the full graph" aria-haspopup="dialog">
			<Maximize2 aria-hidden="true" />
		</button>
	</div>
</section>

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
<dialog
	class="graph-dialog"
	bind:this={dialog}
	onclose={() => (expanded = false)}
	onclick={(event) => event.target === dialog && dialog?.close()}
	aria-label="Graph of the whole vault"
>
	<div class="graph-dialog-panel">
		<div class="graph-head">
			<h2 class="sv-section-title">All notes</h2>
			<button class="sv-icon-button" type="button" onclick={() => dialog?.close()} aria-label="Close">
				<X aria-hidden="true" />
			</button>
		</div>
		{#if expanded}
			<canvas bind:this={globalCanvas} class="graph-canvas graph-canvas-full" aria-label="Every note and tag"></canvas>
		{/if}
	</div>
</dialog>

<style>
	.graph-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-block-end: var(--sv-space-1);
	}

	.graph-title {
		margin-block-end: var(--sv-space-2);
	}

	.graph-box {
		position: relative;
	}

	.graph-expand {
		position: absolute;
		inset-block-start: var(--sv-space-1);
		inset-inline-end: var(--sv-space-1);
	}

	h2 {
		margin: 0;
	}

	.graph-canvas {
		display: block;
		inline-size: 100%;
		block-size: 13rem;
		border: var(--sv-rule-width) solid var(--sv-rule);
		border-radius: var(--sv-radius-m);
		cursor: grab;
		touch-action: none;
	}

	.graph-dialog {
		inline-size: min(64rem, calc(100vw - 2rem));
		max-inline-size: none;
		margin: auto;
		padding: 0;
		border: 0;
		background: transparent;
	}

	.graph-dialog::backdrop {
		background: var(--sv-scrim);
		backdrop-filter: blur(3px);
	}

	.graph-dialog-panel {
		padding: var(--sv-space-3) var(--sv-space-4) var(--sv-space-4);
		border: var(--sv-rule-width) solid var(--sv-rule);
		border-radius: var(--sv-radius-l);
		background: var(--sv-paper);
		box-shadow: var(--sv-shadow);
	}

	.graph-canvas-full {
		block-size: min(75vh, 44rem);
	}
</style>
