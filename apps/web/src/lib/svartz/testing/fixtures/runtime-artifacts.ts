import StubPage from '$lib/svartz/testing/StubPage.svelte';
import { TEST_NOTE_ARTIFACT_KEY, testIndex } from './shared';

export const artifacts = new Map([
	[
		TEST_NOTE_ARTIFACT_KEY,
		{
			key: TEST_NOTE_ARTIFACT_KEY,
			path: '/virtual/pages/index.svelte',
			type: 'svelte',
			noteSlug: 'index'
		}
	]
]);

export async function loadNoteArtifact(_key: string) {
	return { default: StubPage };
}

export const index = testIndex;
export const graph = index.graph;
export const backlinks = index.backlinks;
export const search = index.search;
export const searchDocuments = index.search;
export const searchIndex = {};
export const tags = index.tags;
export const folders = index.folders;
export const routes = index.routes;
export const assets = index.assets;
