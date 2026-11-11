import { mdsvex } from 'mdsvex';
import { COLOR_MODE_SCRIPT_HASH } from '@svartz/ui/color-mode';
import adapterAuto from "@sveltejs/adapter-auto";
import adapterCloudflare from "@sveltejs/adapter-cloudflare";
import adapterNode from "@sveltejs/adapter-node";
import adapterStatic from "@sveltejs/adapter-static";

const outDir = process.env.SVARTZ_OUT_DIR ?? "build";
const kitOutDir = process.env.SVARTZ_KIT_OUT_DIR ?? ".svelte-kit";
const basePath = process.env.SVARTZ_BASE_PATH ?? "";
const targetType = process.env.SVARTZ_TARGET_TYPE ?? "static";
const cliPluginModule = process.env.SVARTZ_VITE_PLUGINS_MODULE_PATH;
const adapter = resolveAdapter(targetType);
const negotiatedAdapter = cliPluginModule
	? (await import(cliPluginModule)).withMarkdownNegotiation(adapter, targetType, outDir)
	: adapter;
// `SERVER_ROUTE_SEGMENT` in @svartz/core; plugin requests live under it.
const pluginRoot = `${basePath}/_svartz/`;

function resolveAdapter(target) {
	switch (target) {
		case "node":
			return adapterNode({
				out: outDir,
				precompress: true
			});
		case "cloudflare-workers":
			return adapterCloudflare();
		case "cloudflare-pages":
			return adapterAuto();
		case "static":
		default:
			return adapterStatic({
				pages: outDir,
				assets: outDir,
				fallback: '404.html',
				strict: true
			});
	}
}

/** @type {import('@sveltejs/kit').Config} */
const config = {
	kit: {
		adapter: negotiatedAdapter,
		csp: {
			directives: {
				// Themes pin the reader's colour mode with an inline script before first paint.
				'script-src': ['self', 'blob:', COLOR_MODE_SCRIPT_HASH],
				'style-src': ['self', 'blob:', 'unsafe-inline']
			}
		},
		outDir: kitOutDir,
		paths: {
			base: basePath
		},
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
	},
	preprocess: [mdsvex()],
	extensions: ['.svelte', '.svx']
};

export default config;
