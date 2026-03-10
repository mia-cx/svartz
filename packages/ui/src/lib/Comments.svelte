<script lang="ts">
	type GiscusConfig = {
		repo: string;
		repoId: string;
		category: string;
		categoryId: string;
		mapping: string;
		strict: boolean;
		reactionsEnabled: boolean;
		inputPosition: string;
		lang: string;
		lightTheme: string;
		darkTheme: string;
	};

	function currentTheme(cfg: GiscusConfig): string {
		return document.documentElement.classList.contains('dark') ? cfg.darkTheme : cfg.lightTheme;
	}

	function sendThemeUpdate(theme: string) {
		const iframe = document.querySelector<HTMLIFrameElement>('.giscus-frame');
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
		script.setAttribute('data-strict', cfg.strict ? '1' : '0');
		script.setAttribute('data-reactions-enabled', cfg.reactionsEnabled ? '1' : '0');
		script.setAttribute('data-emit-metadata', '0');
		script.setAttribute('data-input-position', cfg.inputPosition);
		script.setAttribute('data-theme', currentTheme(cfg));
		script.setAttribute('data-lang', cfg.lang);
		script.setAttribute('crossorigin', 'anonymous');
		script.async = true;
		node.appendChild(script);

		const observer = new MutationObserver(() => sendThemeUpdate(currentTheme(cfg)));
		observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });

		return {
			destroy() {
				observer.disconnect();
			}
		};
	}

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

	const giscusConfig = $derived({
		repo,
		repoId,
		category,
		categoryId,
		mapping,
		strict,
		reactionsEnabled,
		inputPosition,
		lang,
		lightTheme,
		darkTheme
	});
</script>

{#if enabled}
	<div class="giscus mt-8" use:giscus={giscusConfig}></div>
{/if}
