import type { Component } from 'svelte';
import { createVaultEntryView, type ProtectedGroupPayload } from '@svartz/core';
import { base } from '$app/paths';
import { browser } from '$app/environment';
import {
	resolveContentComponents,
	type ContentComponentOverrides
} from './content-components.js';
import type { ProtectedNoteReference } from './protected-client.js';

type ThemeModule = typeof import('virtual:svartz/theme');
type ArtifactsModule = typeof import('virtual:svartz/artifacts');

export interface VaultPageInput {
	/** The app pathname with the deployment base already removed. */
	readonly appPathname: string;
	readonly runtimeTheme: ThemeModule;
	readonly artifacts: ArtifactsModule;
	readonly contentComponents: ContentComponentOverrides;
}

export type PageModule = {
	default: Component<any>;
	svartzProtected?: ProtectedNoteReference;
};

export function normalizeSlug(currentPathname: string): string | undefined {
	if (currentPathname === '/') return undefined;
	return currentPathname.replace(/^\/+|\/+$/g, '');
}

export function artifactKeyToSlug(artifactKey: string | undefined): string | undefined {
	if (!artifactKey) return undefined;
	return artifactKey.replace(/^pages\//, '').replace(/\.svelte$/, '');
}

/** Per-page vault state shared by the full theme page and the single-note body renderer. */
export class VaultPageState {
	#input: () => VaultPageInput;

	constructor(input: () => VaultPageInput) {
		this.#input = input;
	}

	unlockedGroups = $state<ReadonlyMap<string, ProtectedGroupPayload>>(new Map());

	revealGroup = (id: string, payload: ProtectedGroupPayload): void => {
		this.unlockedGroups = new Map([...this.unlockedGroups, [id, payload]]);
	};

	hideGroup = (id: string): void => {
		const next = new Map(this.unlockedGroups);
		next.delete(id);
		this.unlockedGroups = next;
	};

	artifacts = $derived.by(() => this.#input().artifacts);
	discovery = $derived(this.artifacts.createUnlockedVault([...this.unlockedGroups.values()]));
	vault = $derived(this.discovery.vault);
	index = $derived(this.discovery.index);
	theme = $derived.by(() => this.#input().runtimeTheme.theme);
	contentComponents = $derived.by(() =>
		resolveContentComponents(
			this.#input().contentComponents,
			this.theme.components as Parameters<typeof resolveContentComponents>[1]
		)
	);

	vaultPathname = $derived.by(() => {
		const appPathname = this.#input().appPathname;
		const mountPath = this.artifacts.routes.mountPath;
		return mountPath && appPathname.startsWith(`${mountPath}/`)
			? appPathname.slice(mountPath.length)
			: appPathname === mountPath
				? '/'
				: appPathname;
	});

	canonicalEntry = $derived.by(() => {
		const appPathname = this.#input().appPathname;
		return this.index.entries.find(
			(candidate) =>
				candidate.href === (appPathname.endsWith('/') ? appPathname : `${appPathname}/`)
		);
	});

	runtimeRoute = $derived.by(() => {
		const match = this.#input().runtimeTheme.resolveRuntimeRoute({
			pathname: this.vaultPathname,
			slug: normalizeSlug(this.vaultPathname)
		});
		if (!this.canonicalEntry || match?.route.id === 'note') return match;
		const noteRoute = this.theme.routes.find((route) => route.id === 'note');
		return noteRoute
			? {
					route: noteRoute,
					pathname: this.vaultPathname,
					params: { slug: this.canonicalEntry.slug },
					layoutSlot: noteRoute.layoutSlot,
					artifactKey: `pages/${this.canonicalEntry.slug}.svelte`
				}
			: match;
	});

	entry = $derived.by(() => {
		const slug = artifactKeyToSlug(this.runtimeRoute?.artifactKey);
		if (!slug) return undefined;
		const listed = this.vault.entries.find((candidate) => candidate.slug === slug);
		if (listed) return listed;
		const hidden = [...this.unlockedGroups.values()]
			.flatMap((group) => group.entries)
			.find((candidate) => candidate.slug === slug);
		return hidden ? createVaultEntryView(hidden, base) : undefined;
	});

	/** The common props every theme layout and page body receive. */
	themeProps = $derived({
		assets: this.artifacts.assets,
		themeConfig: this.artifacts.themeConfig,
		site: this.artifacts.siteConfig,
		route: this.runtimeRoute?.route,
		match: this.runtimeRoute,
		entry: this.entry,
		index: this.index,
		vault: this.vault,
		graph: this.index.graph,
		backlinks: this.index.backlinks,
		folders: this.vault.folders,
		routes: this.artifacts.routes,
		search: this.index.search,
		searchDocuments: this.discovery.searchDocuments,
		searchIndex: this.discovery.searchIndex,
		searchOptions: this.artifacts.searchOptions,
		tags: this.vault.tags
	});

	noteModule: PageModule | undefined = $derived(
		this.runtimeRoute &&
			!this.runtimeRoute.route.component &&
			this.runtimeRoute.artifactKey &&
			this.artifacts.hasNoteArtifact(this.runtimeRoute.artifactKey)
			? this.artifacts.getNoteArtifact(this.runtimeRoute.artifactKey)
			: undefined
	);
}

/** Mount the vault's browser-only resources (search, protected bridges) while rendered. */
export function useBrowserResources(input: () => {
	artifacts: ArtifactsModule;
	pathname: string;
}): void {
	$effect(() => {
		if (!browser) return;
		const { artifacts, pathname } = input();
		let released = false;
		let dispose: (() => void) | undefined;
		void artifacts
			.mountBrowserResources(pathname)
			.then((cleanup) => {
				if (released) cleanup();
				else dispose = cleanup;
			})
			.catch((error: unknown) =>
				console.error('[svartz:web] browser resource mount failed', error)
			);
		return () => {
			released = true;
			dispose?.();
		};
	});
}
