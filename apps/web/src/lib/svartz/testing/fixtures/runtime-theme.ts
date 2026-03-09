import StubLayout from '$lib/svartz/testing/StubLayout.svelte';
import StubPage from '$lib/svartz/testing/StubPage.svelte';
import StubNotFoundPage from '$lib/svartz/testing/StubNotFoundPage.svelte';
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
	})
};

export const routes = theme.routes;

export function resolveRuntimeRoute(input: { pathname: string; slug?: string }) {
	if (input.pathname === '/tags/testing/' || input.pathname === '/tags/testing') {
		return {
			route: routes[1],
			layoutSlot: 'tagPage',
			pathname: input.pathname,
			params: { slug: 'testing' }
		};
	}

	if (input.pathname === '/folders/guides/' || input.pathname === '/folders/guides') {
		return {
			route: routes[2],
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
