import { paraglideVitePlugin } from '@inlang/paraglide-js';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vitest/config';
import { playwright } from '@vitest/browser-playwright';
import { sveltekit } from '@sveltejs/kit/vite';

const SVARTZ_THEME_VIRTUAL_ID = 'virtual:svartz/theme';
const SVARTZ_ARTIFACTS_VIRTUAL_ID = 'virtual:svartz/artifacts';
const RESOLVED_SVARTZ_THEME_VIRTUAL_ID = '\0svartz:test-theme';
const RESOLVED_SVARTZ_ARTIFACTS_VIRTUAL_ID = '\0svartz:test-artifacts';

function svartzTestVirtualModules() {
	return {
		name: 'svartz:test-virtual-modules',
		enforce: 'pre' as const,
		resolveId(id: string) {
			if (id === SVARTZ_THEME_VIRTUAL_ID) return RESOLVED_SVARTZ_THEME_VIRTUAL_ID;
			if (id === SVARTZ_ARTIFACTS_VIRTUAL_ID) return RESOLVED_SVARTZ_ARTIFACTS_VIRTUAL_ID;
			return null;
		},
		load(id: string) {
			if (id === RESOLVED_SVARTZ_THEME_VIRTUAL_ID) {
				return `
import StubLayout from '$lib/svartz/testing/StubLayout.svelte';

export const theme = {
	id: 'svartz:test-theme',
	version: '0.0.1',
	contractVersion: '1.0.0',
	layouts: {
		defaultPage: { default: StubLayout },
		notePage: { default: StubLayout },
		notFoundPage: { default: StubLayout }
	},
	routes: [{ id: 'home', pattern: '/', layoutSlot: 'notePage' }]
};

export const routes = theme.routes;

export function resolveRuntimeRoute(input) {
	return {
		route: routes[0],
		layoutSlot: 'notePage',
		artifactKey: 'pages/index.svelte',
		pathname: input.pathname,
		params: { slug: input.slug }
	};
}

export function resolveRouteToArtifactKey() {
	return 'pages/index.svelte';
}`;
			}

			if (id === RESOLVED_SVARTZ_ARTIFACTS_VIRTUAL_ID) {
				return `
import StubPage from '$lib/svartz/testing/StubPage.svelte';

export const artifacts = new Map([
	[
		'pages/index.svelte',
		{
			key: 'pages/index.svelte',
			path: '/virtual/pages/index.svelte',
			type: 'svelte',
			noteSlug: 'index'
		}
	]
]);

export async function loadNoteArtifact() {
	return { default: StubPage };
}

export const index = {
	version: '1.0.0',
	entries: [
		{
			slug: 'index',
			path: 'index.md',
			title: 'Svartz test page',
			tags: [],
			aliases: [],
			description: 'Runtime shell test page.',
			links: [],
			wordCount: 3,
			readingTimeMinutes: 1,
			createdAt: new Date('2026-01-01T00:00:00.000Z'),
			modifiedAt: new Date('2026-01-01T00:00:00.000Z')
		}
	],
	graph: { index: [] },
	backlinks: { index: [] }
};

export const graph = index.graph;
export const backlinks = index.backlinks;
export const search = index.entries;`;
			}

			return null;
		}
	};
}

const isVitest = Boolean(process.env.VITEST);

export default defineConfig({
	plugins: [
		...(isVitest ? [svartzTestVirtualModules()] : []),
		tailwindcss(),
		sveltekit(),
		paraglideVitePlugin({ project: './project.inlang', outdir: './src/lib/paraglide' })
	],
	test: {
		expect: { requireAssertions: true },
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
