import { paraglideVitePlugin } from '@inlang/paraglide-js';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
import { playwright } from '@vitest/browser-playwright';
import { sveltekit } from '@sveltejs/kit/vite';
import adapterAuto from '@sveltejs/adapter-auto';
import adapterCloudflare from '@sveltejs/adapter-cloudflare';
import adapterNode from '@sveltejs/adapter-node';
import adapterStatic from '@sveltejs/adapter-static';
import { mdsvex } from 'mdsvex';
import { COLOR_MODE_SCRIPT_HASH } from '@svartz/ui/color-mode';
import type { PluginOption } from 'vite';

const SVARTZ_THEME_VIRTUAL_ID = 'virtual:svartz/theme';
const SVARTZ_ARTIFACTS_VIRTUAL_ID = 'virtual:svartz/artifacts';
const SVARTZ_HOST_VIRTUAL_ID = 'virtual:svartz/host';
const SVARTZ_TAILWIND_SOURCES_VIRTUAL_ID = 'virtual:svartz/tailwind-sources.css';
const runtimeThemeModulePath = process.env.SVARTZ_THEME_MODULE_PATH;
const runtimeThemeSources: Record<string, string> = JSON.parse(process.env.SVARTZ_THEME_SOURCES ?? '{}');
const runtimeArtifactsModulePath = process.env.SVARTZ_ARTIFACTS_MODULE_PATH;
const runtimeHostModulePath = process.env.SVARTZ_HOST_MODULE_PATH;
const runtimeTailwindSourcesPath = process.env.SVARTZ_TAILWIND_SOURCES_PATH;
const testRuntimeThemeModulePath = fileURLToPath(
	new URL('./src/lib/svartz/testing/fixtures/runtime-theme.ts', import.meta.url)
);
const testRuntimeArtifactsModulePath = fileURLToPath(
	new URL('./src/lib/svartz/testing/fixtures/runtime-artifacts.ts', import.meta.url)
);
const testRuntimeHostModulePath = fileURLToPath(
	new URL('./src/lib/svartz/testing/fixtures/runtime-host.ts', import.meta.url)
);
const fallbackTailwindSourcesPath = fileURLToPath(
	new URL('./src/lib/svartz/testing/fixtures/tailwind-sources.css', import.meta.url)
);

const isVitest = Boolean(process.env.VITEST);
const cliPluginModule = process.env.SVARTZ_VITE_PLUGINS_MODULE_PATH;
const cliModule = cliPluginModule ? await import(cliPluginModule) : undefined;
const cliPlugins: PluginOption[] = cliModule ? [cliModule.default as PluginOption] : [];

const outDir = process.env.SVARTZ_OUT_DIR ?? 'build';
const kitOutDir = process.env.SVARTZ_KIT_OUT_DIR ?? '.svelte-kit';
const basePath = process.env.SVARTZ_BASE_PATH ?? '';
const targetType = process.env.SVARTZ_TARGET_TYPE ?? 'static';
const adapter = resolveAdapter(targetType);
const negotiatedAdapter = cliModule
	? cliModule.withMarkdownNegotiation(adapter, targetType, outDir)
	: adapter;
// `SERVER_ROUTE_SEGMENT` in @svartz/core; plugin requests live under it.
const pluginRoot = `${basePath}/_svartz/`;

function resolveAdapter(target: string) {
	switch (target) {
		case 'node':
			return adapterNode({ out: outDir, precompress: true });
		case 'cloudflare-workers':
			return adapterCloudflare();
		case 'cloudflare-pages':
			return adapterAuto();
		case 'static':
		default:
			return adapterStatic({ pages: outDir, assets: outDir, fallback: '404.html', strict: true });
	}
}

export default defineConfig({
	build: {
		emptyOutDir: true
	},
	environments: {
		// adapter-cloudflare prebundles SSR dependencies; a prebundled `@sveltejs/kit/hooks` would carry its own
		// request store, so `sequence` fails with "Could not get the request store".
		ssr: { optimizeDeps: { exclude: ['@sveltejs/kit'] } }
	},
	resolve: {
		// Theme sources alias by exact id, so another listed theme's `<id>/runtime` import still reaches the package.
		alias: [
			...Object.entries(runtimeThemeSources).map(([id, source]) => ({
				find: new RegExp(`^${id.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}$`),
				replacement: source
			})),
			...Object.entries({
			...(runtimeHostModulePath
				? { [SVARTZ_HOST_VIRTUAL_ID]: runtimeHostModulePath }
				: isVitest ? { [SVARTZ_HOST_VIRTUAL_ID]: testRuntimeHostModulePath } : {}),
			...(runtimeThemeModulePath
				? { [SVARTZ_THEME_VIRTUAL_ID]: runtimeThemeModulePath }
				: isVitest
					? { [SVARTZ_THEME_VIRTUAL_ID]: testRuntimeThemeModulePath }
					: {}),
			...(runtimeArtifactsModulePath
				? { [SVARTZ_ARTIFACTS_VIRTUAL_ID]: runtimeArtifactsModulePath }
				: isVitest
					? { [SVARTZ_ARTIFACTS_VIRTUAL_ID]: testRuntimeArtifactsModulePath }
				: {}),
			[SVARTZ_TAILWIND_SOURCES_VIRTUAL_ID]:
				runtimeTailwindSourcesPath ?? fallbackTailwindSourcesPath
			}).map(([find, replacement]) => ({ find, replacement }))
		]
	},
	plugins: [
		tailwindcss(),
		sveltekit({
			adapter: negotiatedAdapter,
			preprocess: [mdsvex()],
			extensions: ['.svelte', '.svx'],
			csp: {
				directives: {
					// Themes pin the reader's colour mode with an inline script before first paint. The submissions
					// plugin's Turnstile challenge loads Cloudflare's script; its iframe needs no rule, since no frame-src is set.
					'script-src': ['self', 'blob:', COLOR_MODE_SCRIPT_HASH, 'https://challenges.cloudflare.com'],
					'style-src': ['self', 'blob:', 'unsafe-inline']
				}
			},
			outDir: kitOutDir,
			paths: { base: basePath },
			prerender: {
				handleMissingId: 'warn',
				// Server plugins answer /_svartz/<id>/ at runtime only, so a note linking there must not fail the crawl.
				handleHttpError: ({ status, path, message }) => {
					if (targetType !== 'static' && status === 404 && path.startsWith(pluginRoot)) {
						console.warn(`[svartz] not prerendering plugin URL ${path}`);
						return;
					}
					throw new Error(message);
				}
			}
		}),
		paraglideVitePlugin({ project: './project.inlang', outdir: './src/lib/paraglide' }),
		...cliPlugins
	],
	test: {
		expect: { requireAssertions: true },
		coverage: {
			provider: "v8",
			reporter: ["text", "html"],
		},
		projects: [
			{
				extends: './vite.config.ts',
				test: {
					name: 'client',
					browser: {
						enabled: true,
						provider: playwright(),
						instances: [{ browser: 'chromium', headless: true }]
					},
					include: ['src/**/*.svelte.{test,spec}.{js,ts}'],
					exclude: ['src/lib/server/**']
				}
			},

			{
				extends: './vite.config.ts',
				test: {
					name: 'server',
					environment: 'node',
					include: ['src/**/*.{test,spec}.{js,ts}'],
					exclude: ['src/**/*.svelte.{test,spec}.{js,ts}']
				}
			}
		]
	}
});
