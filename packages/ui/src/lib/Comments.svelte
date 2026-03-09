<script lang="ts">
	import { onMount } from 'svelte';

	let {
		repo,
		repoId,
		category,
		categoryId,
		mapping = 'pathname',
		strict = false,
		reactionsEnabled = true,
		inputPosition = 'bottom',
		lang = 'en',
		lightTheme = 'light',
		darkTheme = 'dark',
		enabled = true
	}: {
		repo: string;
		repoId: string;
		category: string;
		categoryId: string;
		mapping?: 'url' | 'title' | 'og:title' | 'specific' | 'number' | 'pathname';
		strict?: boolean;
		reactionsEnabled?: boolean;
		inputPosition?: 'top' | 'bottom';
		lang?: string;
		lightTheme?: string;
		darkTheme?: string;
		/** Set to false to suppress comments (e.g. via frontmatter). */
		enabled?: boolean;
	} = $props();

	let containerEl = $state<HTMLDivElement | undefined>(undefined);

	function currentTheme(): string {
		return document.documentElement.classList.contains('dark') ? darkTheme : lightTheme;
	}

	function sendThemeUpdate(theme: string) {
		const iframe = document.querySelector<HTMLIFrameElement>('.giscus-frame');
		iframe?.contentWindow?.postMessage({ giscus: { setConfig: { theme } } }, 'https://giscus.app');
	}

	onMount(() => {
		if (!enabled || !containerEl) return;

		const script = document.createElement('script');
		script.src = 'https://giscus.app/client.js';
		script.setAttribute('data-repo', repo);
		script.setAttribute('data-repo-id', repoId);
		script.setAttribute('data-category', category);
		script.setAttribute('data-category-id', categoryId);
		script.setAttribute('data-mapping', mapping);
		script.setAttribute('data-strict', strict ? '1' : '0');
		script.setAttribute('data-reactions-enabled', reactionsEnabled ? '1' : '0');
		script.setAttribute('data-emit-metadata', '0');
		script.setAttribute('data-input-position', inputPosition);
		script.setAttribute('data-theme', currentTheme());
		script.setAttribute('data-lang', lang);
		script.setAttribute('crossorigin', 'anonymous');
		script.async = true;
		containerEl.appendChild(script);

		// Keep theme in sync when Tailwind's dark class toggles on <html>
		const observer = new MutationObserver(() => sendThemeUpdate(currentTheme()));
		observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });

		return () => observer.disconnect();
	});
</script>

{#if enabled}
	<div class="giscus mt-8" bind:this={containerEl}></div>
{/if}
