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
		readonly type: string;
		readonly noteSlug?: string;
	}

	export interface RuntimeIndexEntry {
		readonly slug: string;
		readonly path: string;
		readonly title: string;
		readonly tags: readonly string[];
		readonly aliases: readonly string[];
		readonly description?: string;
	}

	export const artifacts: ReadonlyMap<string, RuntimeArtifactRecord>;
	export function loadNoteArtifact(
		key: string
	): Promise<{ default: Component<any> }>;
	export const index: {
		readonly version: string;
		readonly entries: readonly RuntimeIndexEntry[];
		readonly graph: Readonly<Record<string, readonly string[]>>;
		readonly backlinks: Readonly<Record<string, readonly string[]>>;
	};
	export const graph: typeof index.graph;
	export const backlinks: typeof index.backlinks;
	export const search: typeof index.entries;
}
