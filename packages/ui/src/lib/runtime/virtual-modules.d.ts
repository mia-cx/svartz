declare module 'virtual:svartz/theme' {
	import type { Component } from 'svelte';

	type ThemeComponentLoader =
		| (() => Promise<{ default: Component<any> }>)
		| { readonly default: Component<any> };

	export interface RuntimeRouteMatch {
		readonly route: {
			readonly id: string;
			readonly pattern: string;
			readonly layoutSlot?: string;
			readonly component?: ThemeComponentLoader;
		};
		readonly pathname: string;
		readonly params: {
			readonly slug?: string;
		};
		readonly layoutSlot?: string;
		readonly artifactKey?: string;
	}

	export const theme: {
		readonly id: string;
		readonly version: string;
		readonly contractVersion: string;
		readonly layouts: Record<string, ThemeComponentLoader | undefined>;
		readonly routes: readonly RuntimeRouteMatch['route'][];
	};

	export const routes: readonly RuntimeRouteMatch['route'][];

	export function resolveRuntimeRoute(input: {
		pathname: string;
		slug?: string;
	}): RuntimeRouteMatch | undefined;

	export function resolveRouteToArtifactKey(input: {
		pathname: string;
		slug?: string;
	}): string | undefined;
}

declare module 'virtual:svartz/artifacts' {
	import type { Component } from 'svelte';

	export interface RuntimeArtifactRecord {
		readonly key: string;
		readonly path: string;
		readonly properties: Readonly<Record<string, unknown>>;
		readonly page: { readonly toc: boolean; readonly comments: boolean };
		readonly type: string;
		readonly noteSlug?: string;
	}

	export interface RuntimeIndexEntry {
		readonly slug: string;
		readonly href: string;
		readonly path: string;
		readonly title: string;
		readonly tags: readonly string[];
		readonly aliases: readonly string[];
		readonly description?: string;
		readonly content: string;
		readonly toc: readonly {
			readonly depth: number;
			readonly text: string;
			readonly slug: string;
		}[];
		readonly wordCount: number;
		readonly readingTimeMinutes: number;
		readonly createdAt: Date;
		readonly modifiedAt: Date;
		readonly publishedAt?: Date;
	}

	export interface RuntimeSearchDocument {
		readonly id: string;
		readonly slug: string;
		readonly href: string;
		readonly title: string;
		readonly description?: string;
		readonly content: string;
		readonly tags: readonly string[];
		readonly aliases: readonly string[];
	}

	export interface RuntimeTagEntry {
		readonly slug: string;
		readonly title: string;
		readonly noteCount: number;
		readonly href: string;
	}

	export interface RuntimeFolderEntry {
		readonly slug: string;
		readonly title: string;
		readonly noteCount: number;
		readonly href: string;
	}

	export const artifacts: ReadonlyMap<string, RuntimeArtifactRecord>;
	export const browserResources: Readonly<Record<string, string>>;
	export function hasNoteArtifact(key: string): boolean;
	export function getNoteArtifact(
		key: string
	): { default: Component<any> };
	export const index: {
		readonly version: string;
		readonly entries: readonly RuntimeIndexEntry[];
		readonly graph: Readonly<Record<string, readonly string[]>>;
		readonly backlinks: Readonly<Record<string, readonly string[]>>;
		readonly search: readonly RuntimeSearchDocument[];
		readonly tags: readonly RuntimeTagEntry[];
		readonly folders: readonly RuntimeFolderEntry[];
		readonly routes: {
			readonly mountPath: string;
			readonly notes: readonly string[];
			readonly redirects: Readonly<Record<string, string>>;
			readonly tags: readonly string[];
			readonly folders: readonly string[];
			readonly feed: readonly string[];
			readonly all: readonly string[];
		};
		readonly assets: readonly {
			readonly path: string;
			readonly sourcePath: string;
			readonly mimeType?: string;
		}[];
	};
	export const vault: {
		readonly id: string;
		readonly entries: readonly RuntimeIndexEntry[];
		readonly search: readonly RuntimeSearchDocument[];
		readonly tags: readonly RuntimeTagEntry[];
		readonly folders: readonly RuntimeFolderEntry[];
		readonly routes: typeof index.routes;
		note(reference: string): {
			readonly entry: RuntimeIndexEntry;
			readonly outgoing: readonly RuntimeIndexEntry[];
			readonly backlinks: readonly RuntimeIndexEntry[];
		} | undefined;
	};
	export const searchOptions: {
		readonly fields: readonly string[];
		readonly storeFields: readonly string[];
		readonly idField: string;
	};
	export const graph: typeof index.graph;
	export const backlinks: typeof index.backlinks;
	export const search: typeof index.search;
	export const tags: typeof index.tags;
	export const folders: typeof index.folders;
	export const routes: typeof index.routes;
	export const assets: typeof index.assets;
	export const searchDocuments: readonly RuntimeSearchDocument[];
	export const searchIndex: unknown;
	/** Vault-level theme config (everything under `theme:` in svartz.config, minus `base`). */
	export const themeConfig: Readonly<Record<string, unknown>>;
	export const siteConfig: Readonly<{
		title: string;
		description?: string;
		url?: string;
		author?: string;
		image?: string;
	}>;
}

declare module 'virtual:svartz/host' {
	export const vaults: readonly {
		readonly id: string;
		readonly mountPath: string;
		readonly artifacts: typeof import('virtual:svartz/artifacts');
		readonly theme: typeof import('virtual:svartz/theme');
	}[];
	export const routes: {
		readonly all: readonly string[];
		readonly redirects: Readonly<Record<string, string>>;
	};
	export function resolveHostVault(pathname: string): (typeof vaults)[number] | undefined;
}
