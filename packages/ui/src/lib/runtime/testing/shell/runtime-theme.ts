import type { IndexEntry, PageStructuredData } from '@svartz/core';
import StubLayout from './StubLayout.svelte';
import StubPage from './StubPage.svelte';
import StubNotFoundPage from './StubNotFoundPage.svelte';
import { TEST_NOTE_ARTIFACT_KEY, testRoutes } from './shared';

export const theme = {
	id: 'svartz:test-theme',
	version: '0.0.1',
	contractVersion: '1.0.0',
	layouts: {
		defaultPage: { default: StubLayout },
		notePage: { default: StubLayout },
		tagPage: { default: StubLayout },
		folderPage: { default: StubLayout },
		notFoundPage: { default: StubNotFoundPage }
	},
	routes: testRoutes.map((route) => {
		if (route.id === 'home') return route;
		return { ...route, component: { default: StubPage } };
	}),
	// A theme page kind: notes with `kind: guide` are tech articles.
	structuredData: (nodes: PageStructuredData, { entry }: { entry?: IndexEntry }) =>
		entry?.properties.kind === 'guide' ? { ...nodes, article: { ...nodes.article!, '@type': 'TechArticle' } } : nodes
};

export const routes = theme.routes;
export const ready = Promise.resolve();

export function resolveRuntimeRoute(input: { pathname: string; slug?: string }) {
	if (input.pathname === '/tags/other/' || input.pathname === '/tags/other') {
		return {
			route: routes[2],
			layoutSlot: 'tagPage',
			pathname: input.pathname,
			params: { slug: 'other' }
		};
	}

	if (input.pathname === '/folders/guides/' || input.pathname === '/folders/guides') {
		return {
			route: routes[3],
			layoutSlot: 'folderPage',
			pathname: input.pathname,
			params: { slug: 'guides' }
		};
	}

	if (input.pathname === '/missing/' || input.pathname === '/missing') {
		return undefined;
	}

	return {
		route: routes[0],
		layoutSlot: 'notePage',
		artifactKey: TEST_NOTE_ARTIFACT_KEY,
		pathname: input.pathname,
		params: { slug: input.slug }
	};
}

export function resolveRouteToArtifactKey(input: { pathname: string; slug?: string }) {
	const match = resolveRuntimeRoute(input);
	return match?.artifactKey;
}
