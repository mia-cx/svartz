<!--
	Light/dark switch. Place it once per page; it also injects the no-flash head
	script, so themes need nothing else for colour modes.
-->
<script lang="ts">
	import { Moon, Sun } from '@lucide/svelte';
	import { onMount } from 'svelte';
	import { COLOR_MODE_SCRIPT, currentColorMode, setColorMode, type ColorMode } from './color-mode.js';

	let mode = $state<ColorMode>();

	onMount(() => {
		mode = currentColorMode();
	});

	function toggle() {
		mode = currentColorMode() === 'dark' ? 'light' : 'dark';
		setColorMode(mode);
	}
</script>

<svelte:head>
	<!-- eslint-disable-next-line svelte/no-at-html-tags -- static, first-party script -->
	{@html `<script>${COLOR_MODE_SCRIPT}</script>`}
</svelte:head>

<button
	class="sv-icon-button sv-color-mode"
	type="button"
	onclick={toggle}
	aria-label={mode === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
>
	<Sun class="sv-color-mode-sun" aria-hidden="true" />
	<Moon class="sv-color-mode-moon" aria-hidden="true" />
</button>

<style>
	/* CSS picks the icon, so SSR shows the right one before hydration. */
	:global(.sv-color-mode .sv-color-mode-moon) {
		display: none;
	}

	:global(:root.dark .sv-color-mode .sv-color-mode-sun) {
		display: none;
	}

	:global(:root.dark .sv-color-mode .sv-color-mode-moon) {
		display: block;
	}

	@media (prefers-color-scheme: dark) {
		:global(:root:not(.light) .sv-color-mode .sv-color-mode-sun) {
			display: none;
		}

		:global(:root:not(.light) .sv-color-mode .sv-color-mode-moon) {
			display: block;
		}
	}
</style>
