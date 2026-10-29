<!-- The site's mark (`theme.logo`), placed inside a `.sv-wordmark` link before the title. With a dark variant, base.css shows each image only in its colour mode. -->
<script lang="ts">
	import { base } from '$app/paths';
	import type { LogoSettings } from './theme-settings.js';

	let { logo }: { logo: LogoSettings | undefined } = $props();

	// Paths from the site root gain the deployment base, like other site asset links; URLs pass through.
	const resolve = (src: string) => (src.startsWith('/') && !src.startsWith('//') ? `${base}${src}` : src);
</script>

{#if logo}
	<img class="sv-logo" src={resolve(logo.src)} alt={logo.alt} data-color-mode={logo.dark ? 'light' : undefined} />
	{#if logo.dark}<img class="sv-logo" src={resolve(logo.dark)} alt={logo.alt} data-color-mode="dark" />{/if}
{/if}
