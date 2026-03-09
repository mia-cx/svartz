import { mdsvex } from 'mdsvex';
import adapterAuto from "@sveltejs/adapter-auto";
import adapterCloudflare from "@sveltejs/adapter-cloudflare";
import adapterNode from "@sveltejs/adapter-node";
import adapterStatic from "@sveltejs/adapter-static";

const outDir = process.env.SVARTZ_OUT_DIR ?? "build";
const kitOutDir = process.env.SVARTZ_KIT_OUT_DIR ?? ".svelte-kit";
const basePath = process.env.SVARTZ_BASE_PATH ?? "";
const targetType = process.env.SVARTZ_TARGET_TYPE ?? "static";

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
				strict: true
			});
	}
}

/** @type {import('@sveltejs/kit').Config} */
const config = {
	kit: {
		adapter: resolveAdapter(targetType),
		outDir: kitOutDir,
		paths: {
			base: basePath
		}
	},
	preprocess: [mdsvex()],
	extensions: ['.svelte', '.svx']
};

export default config;