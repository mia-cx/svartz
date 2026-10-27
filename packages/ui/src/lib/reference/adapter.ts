import type { IndexEntry } from '@svartz/core';
import type { Component } from 'svelte';
import ReferenceBody from './ReferenceBody.svelte';
import ReferenceExamples from './ReferenceExamples.svelte';
import ReferenceFrame from './ReferenceFrame.svelte';
import ReferenceTopBar from './ReferenceTopBar.svelte';
import { readReferencePage, rendererIdOf, type ReferenceNavItem, type ReferenceRenderer, type ReferenceShellProps } from './renderers.js';
import type { ReferenceThemeIdentity } from './theme.js';

/** A page renderer that wraps a reference renderer; its shape is theme-minimal's `PageRenderer`. */
export interface ReferencePageRenderer {
	readonly id: string;
	readonly source: ReferenceRenderer;
	readonly detect: (properties: Readonly<Record<string, unknown>>, entry: IndexEntry) => unknown;
	readonly body: Component<ReferenceShellProps>;
	readonly aside?: Component<ReferenceShellProps>;
	readonly explorerItem: (data: unknown, entry: IndexEntry) => ReferenceNavItem;
}

const adapted = new WeakMap<ReferenceRenderer, ReferencePageRenderer>();

/**
 * A reference renderer as a theme-minimal page renderer: it claims the pages
 * whose `operation.protocol` (or `model`) names it, renders through
 * `ReferenceBody` and `ReferenceExamples`, and lists with its badge. The same
 * renderer always adapts to the same object, so a renderer two themes share
 * (the schema renderer) stays one claim.
 */
export function referenceRenderer(renderer: ReferenceRenderer): ReferencePageRenderer {
	const cached = adapted.get(renderer);
	if (cached) return cached;
	const page: ReferencePageRenderer = {
		id: renderer.id,
		source: renderer,
		detect: (properties) => (rendererIdOf(properties) === renderer.id ? readReferencePage(renderer, properties) : undefined),
		body: ReferenceBody,
		aside: renderer.examples ? ReferenceExamples : undefined,
		explorerItem: (data, entry) => renderer.nav(data, entry)
	};
	adapted.set(renderer, page);
	return page;
}

/** Reference sites keep the page and its examples: no graph, backlinks, dates, or reader mode; a filter above the explorer. */
export const referenceChrome = {
	graph: false,
	backlinks: false,
	dates: false,
	summary: true,
	readerMode: false,
	explorerFilter: true,
	pageNav: true
} as const;

/**
 * A reference theme as a theme-minimal extension: the reference frame and top
 * bar, these renderers, and reference chrome. Guides get minimal's page head
 * and contents; pages a renderer claims get its page and examples.
 *
 * ```js
 * // theme/runtime.js: a site's own composition
 * import { composeThemes } from '@svartz/theme-minimal/runtime';
 * import { referenceExtension } from '@svartz/ui/reference/runtime';
 * export default (config) => composeThemes([referenceExtension({ id: '@acme/docs' }, [...apiRenderers, ...mcpRenderers])], config);
 * ```
 */
export function referenceExtension(identity: ReferenceThemeIdentity, renderers: readonly ReferenceRenderer[]) {
	return {
		...identity,
		frame: ReferenceFrame,
		regions: { header: ReferenceTopBar },
		renderers: [...new Set(renderers)].map(referenceRenderer),
		chrome: referenceChrome
	};
}
