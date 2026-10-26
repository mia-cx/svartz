import type { IndexEntry } from '@svartz/core';
import { createContext } from 'svelte';
import type { ReferenceNavSection } from './nav.js';
import type { ReferenceNavItem, ReferenceRegistry } from './renderers.js';

/** What the reference layout shares with the list pages it wraps. */
export interface ReferenceShell {
	readonly registry: ReferenceRegistry;
	readonly sections: readonly ReferenceNavSection<IndexEntry>[];
	/** A reference page's badge and label; `undefined` for a guide. */
	readonly itemOf: (entry: IndexEntry) => ReferenceNavItem | undefined;
}

export const [getReferenceShell, setReferenceShell] = createContext<ReferenceShell>();
