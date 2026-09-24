<script lang="ts">
	import { currentColorMode } from './color-mode.js';

	type GiscusConfig = {
		repo: string;
		repoId: string;
		category: string;
		categoryId: string;
		mapping: string;
		term?: string;
		strict: boolean;
		reactionsEnabled: boolean;
		inputPosition: string;
		lang: string;
		lightTheme: string;
		darkTheme: string;
	};

	function currentTheme(cfg: GiscusConfig): string {
		return currentColorMode() === 'dark' ? cfg.darkTheme : cfg.lightTheme;
	}

	function sendThemeUpdate(node: HTMLDivElement, theme: string) {
		const iframe = node.querySelector<HTMLIFrameElement>('.giscus-frame');
		iframe?.contentWindow?.postMessage({ giscus: { setConfig: { theme } } }, 'https://giscus.app');
	}

	function giscus(node: HTMLDivElement, cfg: GiscusConfig) {
		const script = document.createElement('script');
		script.src = 'https://giscus.app/client.js';
		script.setAttribute('data-repo', cfg.repo);
		script.setAttribute('data-repo-id', cfg.repoId);
		script.setAttribute('data-category', cfg.category);
		script.setAttribute('data-category-id', cfg.categoryId);
		script.setAttribute('data-mapping', cfg.mapping);
		if (cfg.term) script.setAttribute('data-term', cfg.term);
		script.setAttribute('data-strict', cfg.strict ? '1' : '0');
		script.setAttribute('data-reactions-enabled', cfg.reactionsEnabled ? '1' : '0');
		script.setAttribute('data-emit-metadata', '0');
		script.setAttribute('data-input-position', cfg.inputPosition);
		script.setAttribute('data-theme', currentTheme(cfg));
		script.setAttribute('data-lang', cfg.lang);
		script.setAttribute('crossorigin', 'anonymous');
		script.async = true;
		node.appendChild(script);

		// Hosts may toggle the class themselves; without a class the OS scheme decides.
		const update = () => sendThemeUpdate(node, currentTheme(cfg));
		const observer = new MutationObserver(update);
		observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
		const scheme = matchMedia('(prefers-color-scheme: dark)');
		scheme.addEventListener('change', update);

		return {
			destroy() {
				observer.disconnect();
				scheme.removeEventListener('change', update);
				node.replaceChildren();
			}
		};
	}

	let {
		repo,
		repoId,
		category,
		categoryId,
		mapping = 'pathname',
		term,
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
		term?: string;
		strict?: boolean;
		reactionsEnabled?: boolean;
		inputPosition?: 'top' | 'bottom';
		lang?: string;
		lightTheme?: string;
		darkTheme?: string;
		/** Set to false to suppress comments (e.g. via frontmatter). */
		enabled?: boolean;
	} = $props();

	const giscusConfig = $derived({
		repo,
		repoId,
		category,
		categoryId,
		mapping,
		term,
		strict,
		reactionsEnabled,
		inputPosition,
		lang,
		lightTheme,
		darkTheme
	});
</script>

{#if enabled}
	{#key JSON.stringify(giscusConfig)}
		<div class="giscus mt-8" use:giscus={giscusConfig}></div>
	{/key}
{/if}
