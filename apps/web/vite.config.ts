import { paraglideVitePlugin } from '@inlang/paraglide-js';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
import { playwright } from '@vitest/browser-playwright';
import { sveltekit } from '@sveltejs/kit/vite';

const SVARTZ_THEME_VIRTUAL_ID = 'virtual:svartz/theme';
const SVARTZ_ARTIFACTS_VIRTUAL_ID = 'virtual:svartz/artifacts';
const runtimeThemeModulePath = process.env.SVARTZ_THEME_MODULE_PATH;
const runtimeArtifactsModulePath = process.env.SVARTZ_ARTIFACTS_MODULE_PATH;
const testRuntimeThemeModulePath = fileURLToPath(
	new URL('./src/lib/svartz/testing/fixtures/runtime-theme.ts', import.meta.url)
);
const testRuntimeArtifactsModulePath = fileURLToPath(
	new URL('./src/lib/svartz/testing/fixtures/runtime-artifacts.ts', import.meta.url)
);

const isVitest = Boolean(process.env.VITEST);

export default defineConfig({
	resolve: {
		alias: {
			...(runtimeThemeModulePath
				? { [SVARTZ_THEME_VIRTUAL_ID]: runtimeThemeModulePath }
				: isVitest
					? { [SVARTZ_THEME_VIRTUAL_ID]: testRuntimeThemeModulePath }
					: {}),
			...(runtimeArtifactsModulePath
				? { [SVARTZ_ARTIFACTS_VIRTUAL_ID]: runtimeArtifactsModulePath }
				: isVitest
					? { [SVARTZ_ARTIFACTS_VIRTUAL_ID]: testRuntimeArtifactsModulePath }
				: {})
		}
	},
	plugins: [
		tailwindcss(),
		sveltekit(),
		paraglideVitePlugin({ project: './project.inlang', outdir: './src/lib/paraglide' })
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
