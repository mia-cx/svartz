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

export const browserResources: Readonly<Record<string, string>> = {};
export async function mountBrowserResources(): Promise<() => void> { return () => {}; }

export function hasNoteArtifact(_key: string) {
	return true;
}

export function getNoteArtifact(_key: string) {
	return { default: StubPage };
}

export const index = testIndex;
export const vault = {
	id: 'test',
	...index,
	note(reference: string) {
		const entry = index.entries.find((candidate) => candidate.slug === reference || candidate.href === reference);
		return entry ? { entry, outgoing: [], backlinks: [] } : undefined;
	}
};
export const searchOptions = {
	fields: ['title', 'description', 'content', 'tags', 'aliases'],
	storeFields: ['slug', 'href', 'title', 'description', 'tags'],
	idField: 'id'
};
export const graph = index.graph;
export const backlinks = index.backlinks;
export const search = index.search;
export const searchDocuments = index.search;
export const searchIndex = {};
export const tags = index.tags;
export const folders = index.folders;
export const routes = index.routes;
export const assets = index.assets;
export const themeConfig: Record<string, unknown> = {};
export const siteConfig = {
	title: 'Svartz Test',
	description: 'A test vault',
	url: 'https://example.com',
	author: 'Svartz',
	image: '/social.png'
};
