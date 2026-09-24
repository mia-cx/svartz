<!--
	Hover previews for internal links in note content (`a[data-sv-internal]`).
	Mount once per layout. Pointer devices only: touch readers just follow the
	link. The preview duplicates the target page, so it is hidden from assistive
	technology, which reads the link itself.
-->
<script lang="ts">
	import { autoPlacement, computePosition, inline, offset, shift } from '@floating-ui/dom';
	import { onMount } from 'svelte';
	import { fetchPreview } from './preview.js';

	const OPEN_DELAY_MS = 350;
	const CLOSE_DELAY_MS = 180;

	let panel = $state<HTMLDivElement>();
	let body = $state<HTMLDivElement>();
	let visible = $state(false);
	let anchor: HTMLAnchorElement | undefined;
	let openTimer: ReturnType<typeof setTimeout> | undefined;
	let closeTimer: ReturnType<typeof setTimeout> | undefined;

	async function show(link: HTMLAnchorElement) {
		const { nodes, scrollTarget } = await fetchPreview(link.href);
		if (anchor !== link || !panel || !body || nodes.length === 0) return;
		body.replaceChildren(...nodes);
		const { x, y } = await computePosition(link, panel, {
			strategy: 'fixed',
			middleware: [inline(), offset(8), autoPlacement({ allowedPlacements: ['bottom-start', 'top-start'] }), shift({ padding: 12 })]
		});
		panel.style.translate = `${x}px ${y}px`;
		body.scrollTop = 0;
		if (scrollTarget) {
			const target = body.querySelector(`[id="${CSS.escape(scrollTarget)}"]`);
			if (target instanceof HTMLElement) body.scrollTop = target.offsetTop - 12;
		}
		visible = true;
	}

	function hide() {
		visible = false;
		anchor = undefined;
	}

	onMount(() => {
		if (!matchMedia('(hover: hover) and (pointer: fine)').matches) return;

		const over = (event: PointerEvent) => {
			const target = event.target as Element | null;
			if (panel?.contains(target)) {
				clearTimeout(closeTimer);
				return;
			}
			const link = target?.closest<HTMLAnchorElement>('a[data-sv-internal]');
			if (!link || link === anchor) return;
			clearTimeout(openTimer);
			clearTimeout(closeTimer);
			anchor = link;
			openTimer = setTimeout(() => void show(link), OPEN_DELAY_MS);
		};
		const out = (event: PointerEvent) => {
			const next = event.relatedTarget as Element | null;
			if (next && (panel?.contains(next) || next.closest('a[data-sv-internal]') === anchor)) return;
			clearTimeout(openTimer);
			closeTimer = setTimeout(hide, CLOSE_DELAY_MS);
		};

		document.addEventListener('pointerover', over);
		document.addEventListener('pointerout', out);
		document.addEventListener('click', hide);
		return () => {
			document.removeEventListener('pointerover', over);
			document.removeEventListener('pointerout', out);
			document.removeEventListener('click', hide);
			clearTimeout(openTimer);
			clearTimeout(closeTimer);
		};
	});
</script>

<div class="sv-link-preview" class:visible bind:this={panel} aria-hidden="true">
	<div class="sv-link-preview-body sv-prose" bind:this={body}></div>
</div>

<style>
	.sv-link-preview {
		position: fixed;
		inset: 0 auto auto 0;
		z-index: var(--sv-z-popover);
		inline-size: min(30rem, calc(100vw - 24px));
		visibility: hidden;
		opacity: 0;
		transition:
			opacity var(--sv-duration) var(--sv-ease),
			visibility 0s linear var(--sv-duration);
	}

	.sv-link-preview.visible {
		visibility: visible;
		opacity: 1;
		transition: opacity var(--sv-duration) var(--sv-ease);
	}

	/* Previews clone the page's own title; keep it proportionate to the panel. */
	.sv-link-preview .sv-link-preview-body :global(h1) {
		font-size: var(--sv-step-3);
	}

	.sv-link-preview-body {
		max-block-size: 22rem;
		overflow-y: auto;
		padding: var(--sv-space-4) var(--sv-space-5);
		border: var(--sv-rule-width) solid var(--sv-rule);
		border-radius: var(--sv-radius-l);
		background: var(--sv-paper);
		box-shadow: var(--sv-shadow);
		overscroll-behavior: contain;
	}
</style>
