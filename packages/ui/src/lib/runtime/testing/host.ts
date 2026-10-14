import type { Component } from 'svelte';
import { browser } from '$app/environment';
import CalloutNote from './CalloutNote.svelte';
import LockedNote from './LockedNote.svelte';
import PlainNote from './PlainNote.svelte';
import TagPage from './TagPage.svelte';
import ThemeCallout from './ThemeCallout.svelte';
import ThemeEmbed from './ThemeEmbed.svelte';
import ThemeLayout from './ThemeLayout.svelte';

function testEntry(slug: string) {
	return {
		slug,
		href: `/work/${slug}/`,
		properties: {},
		page: { toc: true, comments: true },
		path: `${slug}.md`,
		title: `The ${slug} note`,
		tags: [],
		aliases: [],
		description: `Test note ${slug}.`,
		content: `Test note ${slug}.`,
		links: [],
		toc: [],
		wordCount: 3,
		readingTimeMinutes: 1,
		createdAt: new Date('2026-01-01T00:00:00.000Z'),
		modifiedAt: new Date('2026-01-01T00:00:00.000Z')
	};
}

const index = {
	version: '1.0.0',
	entries: [testEntry('plain'), testEntry('callouts'), testEntry('secret')],
	graph: {},
	backlinks: {},
	search: [],
	tags: [],
	folders: [],
	routes: {
		mountPath: '/work',
		notes: ['/work/plain/', '/work/callouts/', '/work/secret/'],
		redirects: {},
		tags: [],
		folders: [],
		feed: [],
		theme: [],
		all: ['/work/plain/', '/work/callouts/', '/work/secret/']
	},
	assets: []
};

const noteModules: Record<string, { default: Component<any>; svartzProtected?: { slug: string; payloadId: string; payloadPath: string } }> = {
	'pages/plain.svelte': { default: PlainNote },
	'pages/callouts.svelte': { default: CalloutNote },
	'pages/secret.svelte': {
		default: LockedNote,
		svartzProtected: {
			slug: 'secret',
			payloadId: 'vault:work:group:fixture',
			payloadPath: '/work/secret.json'
		}
	}
};

export const artifacts = {
	artifacts: new Map(),
	browserResources: {},
	async mountBrowserResources(): Promise<() => void> {
		return () => {};
	},
	async loadProtectedBridgeUrls(): Promise<Readonly<Record<string, string>>> {
		return {};
	},
	hasNoteArtifact(key: string) {
		return key in noteModules;
	},
	async prepareNoteArtifact(key: string) {
		return noteModules[key];
	},
	getNoteArtifact(key: string) {
		return noteModules[key]!;
	},
	index,
	vault: {
		id: 'work',
		entries: index.entries,
		search: index.search,
		tags: index.tags,
		folders: index.folders,
		routes: index.routes,
		assets: index.assets,
		note(reference: string) {
			const entry = index.entries.find(
				(candidate) => candidate.slug === reference || candidate.href === reference
			);
			return entry ? { entry, outgoing: [], backlinks: [] } : undefined;
		}
	},
	searchOptions: {
		fields: ['title', 'description', 'content', 'tags', 'aliases'],
		storeFields: ['slug', 'href', 'title', 'description', 'tags'],
		idField: 'id'
	},
	graph: index.graph,
	backlinks: index.backlinks,
	search: index.search,
	tags: index.tags,
	folders: index.folders,
	routes: index.routes,
	assets: index.assets,
	searchDocuments: index.search,
	searchIndex: {},
	createUnlockedVault() {
		return { index, vault: this.vault, searchDocuments: index.search, searchIndex: {} };
	},
	themeConfig: {},
	siteConfig: { title: 'Work', description: 'Work notes' },
	deploymentBasePath: ''
};

function resolveRuntimeRoute(input: { pathname: string; slug?: string }) {
	if (input.pathname.startsWith('/tags/')) {
		return {
			route: theme.routes[1],
			pathname: input.pathname,
			params: { slug: input.slug }
		};
	}
	return {
		route: theme.routes[0],
		layoutSlot: 'notePage',
		pathname: input.pathname,
		params: { slug: input.slug },
		artifactKey: input.slug ? `pages/${input.slug}.svelte` : undefined
	};
}

export const theme = {
	theme: {
		id: 'svartz:test-theme',
		version: '0.0.1',
		contractVersion: '1.0.0',
		layouts: {
			defaultPage: { default: ThemeLayout },
			notePage: { default: ThemeLayout },
			notFoundPage: { default: ThemeLayout }
		},
		components: {
			callout: { default: ThemeCallout },
			embed: { default: ThemeEmbed }
		},
		routes: [
			{ id: 'note', pattern: '/:slug', layoutSlot: 'notePage' },
			{ id: 'tag', pattern: '/tags/:slug', component: { default: TagPage } }
		]
	},
	routes: [
		{ id: 'note', pattern: '/:slug', layoutSlot: 'notePage' },
		{ id: 'tag', pattern: '/tags/:slug', component: { default: TagPage } }
	],
	ready: Promise.resolve(),
	resolveRuntimeRoute,
	resolveRouteToArtifactKey(input: { pathname: string; slug?: string }) {
		return resolveRuntimeRoute(input)?.artifactKey;
	}
};

export const vaults = [{ id: 'work', mountPath: '/work', basePath: '', artifacts, theme }];

export const routes = {
	all: index.routes.all,
	redirects: index.routes.redirects
};

const noteStyles: Record<string, string[]> = {
	'pages/callouts.svelte': ['_app/immutable/assets/callouts.css']
};

function findHostVault(pathname: string) {
	return vaults.find(
		({ mountPath }) => pathname === mountPath || pathname.startsWith(`${mountPath}/`)
	);
}

function noteArtifactKey(pathname: string) {
	const vaultPathname = pathname.slice('/work'.length) || '/';
	const slug = vaultPathname === '/' ? undefined : vaultPathname.replace(/^\/+|\/+$/g, '');
	const match = resolveRuntimeRoute({ pathname: vaultPathname, slug });
	const canonical = pathname.endsWith('/') ? pathname : `${pathname}/`;
	const entry = index.entries.find((candidate) => candidate.href === canonical);
	return entry && match?.route.id !== 'note' ? `pages/${entry.slug}.svelte` : match?.artifactKey;
}

export function hostStylesheets(pathname: string): string[] {
	if (browser || !findHostVault(pathname)) return [];
	const key = noteArtifactKey(pathname);
	return ['_app/immutable/assets/shared.css', ...(key ? (noteStyles[key] ?? []) : [])];
}

export function resolveHostVault(pathname: string) {
	return findHostVault(pathname);
}

export async function prepareHostVault(pathname: string) {
	return resolveHostVault(pathname);
}
