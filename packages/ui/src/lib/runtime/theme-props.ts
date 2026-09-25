import type { IndexEntry, ResolvedSiteConfig, VaultView } from '@svartz/core';
import type { Snippet } from 'svelte';
import type { SearchOptions } from '../search.js';
import type { ContentComponents } from './content-components.js';

/** The route the runtime matched for this page. */
export interface ThemeRouteMatch {
	readonly route: { readonly id: string; readonly pattern: string; readonly layoutSlot?: string };
	readonly pathname: string;
	readonly params: { readonly slug?: string };
}

/**
 * Props every theme layout and page component receives from the Svartz runtime
 * (`SvartzVaultPage`). Layouts also get `children`; pages also get
 * `contentComponents`. Prefer `vault`: its URLs include the deployment base.
 */
export interface ThemePageProps {
	readonly vault: VaultView;
	readonly site: ResolvedSiteConfig;
	/** The published note on note routes. */
	readonly entry?: IndexEntry;
	readonly match?: ThemeRouteMatch;
	readonly themeConfig?: Readonly<Record<string, unknown>>;
	readonly searchIndex?: unknown;
	readonly searchOptions?: SearchOptions;
	readonly contentComponents?: ContentComponents;
	readonly children?: Snippet;
}
