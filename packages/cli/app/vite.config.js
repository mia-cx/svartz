// The app every standalone vault builds with. The CLI loads this file with the vault's settings in `SVARTZ_*`
// variables and merges in the svartz Vite plugin, so it never runs on its own.
import adapterCloudflare from '@sveltejs/adapter-cloudflare';
import adapterNode from '@sveltejs/adapter-node';
import adapterStatic from '@sveltejs/adapter-static';
import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { COLOR_MODE_SCRIPT_HASH } from '@svartz/ui/color-mode';
import { mdsvex } from 'mdsvex';

const env = process.env;
const outDir = env.SVARTZ_OUT_DIR ?? 'build';
const basePath = env.SVARTZ_BASE_PATH ?? '';
const targetType = env.SVARTZ_TARGET_TYPE ?? 'static';
/** @type {Record<string, string>} */
const themeSources = JSON.parse(env.SVARTZ_THEME_SOURCES ?? '{}');
const cliModule = env.SVARTZ_VITE_PLUGINS_MODULE_PATH
	? await import(env.SVARTZ_VITE_PLUGINS_MODULE_PATH)
	: undefined;
// `SERVER_ROUTE_SEGMENT` in @svartz/core; plugin requests live under it.
const pluginRoot = `${basePath}/_svartz/`;

/** @param {string} target */
function resolveAdapter(target) {
	switch (target) {
		case 'node':
			return adapterNode({ out: outDir, precompress: true });
		// adapter-cloudflare emits Pages output when the CLI sets `CF_PAGES`, read when it adapts. For Workers, the CLI
		// writes the vault's Wrangler config beside its `.svelte-kit`, so the worker's `main` lies in SvelteKit's `outDir`.
		case 'cloudflare-workers':
		case 'cloudflare-pages':
			return adapterCloudflare({ config: env.SVARTZ_WRANGLER_CONFIG });
		default:
			return adapterStatic({ pages: outDir, assets: outDir, fallback: '404.html', strict: true });
	}
}

const adapter = resolveAdapter(targetType);

/** @param {string} id */
const exactly = (id) => new RegExp(`^${id.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}$`);

/** @type {import('vite').UserConfig} */
export default {
	environments: {
		// adapter-cloudflare prebundles SSR dependencies; a prebundled `@sveltejs/kit/hooks` would carry its own
		// request store, so `sequence` fails with "Could not get the request store".
		ssr: { optimizeDeps: { exclude: ['@sveltejs/kit'] } }
	},
	resolve: {
		// Theme sources alias by exact id, so another listed theme's `<id>/runtime` import still reaches the package.
		alias: [
			...Object.entries(themeSources).map(([id, source]) => ({ find: exactly(id), replacement: source })),
			...Object.entries({
				'virtual:svartz/host': env.SVARTZ_HOST_MODULE_PATH,
				'virtual:svartz/theme': env.SVARTZ_THEME_MODULE_PATH,
				'virtual:svartz/artifacts': env.SVARTZ_ARTIFACTS_MODULE_PATH,
				'virtual:svartz/tailwind-sources.css': env.SVARTZ_TAILWIND_SOURCES_PATH
			}).flatMap(([find, replacement]) => (replacement ? [{ find: exactly(find), replacement }] : []))
		]
	},
	plugins: [
		tailwindcss(),
		sveltekit({
			adapter: cliModule ? cliModule.withMarkdownNegotiation(adapter, targetType, outDir) : adapter,
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
			// `.env` files belong to the project, beside svartz.config.ts.
			env: { dir: env.SVARTZ_PROJECT_ROOT ?? '.' },
			outDir: env.SVARTZ_KIT_OUT_DIR ?? '.svelte-kit',
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
		...(cliModule ? [cliModule.default] : [])
	]
};
