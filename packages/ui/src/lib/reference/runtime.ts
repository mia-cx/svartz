/**
 * Runtime entry for reference themes: the shell, the shared components, the
 * schema renderer, and `referenceTheme`, which binds renderers to the shell.
 */
import type { SvartzTheme } from '@svartz/core';
import Comments from '../Comments.svelte';
import SearchDialog from '../SearchDialog.svelte';
import { svartzContentComponents } from '../content/index.js';
import NotFoundPage from './pages/NotFoundPage.svelte';
import ReferencePage from './pages/ReferencePage.svelte';
import ResourcePage from './pages/ResourcePage.svelte';
import TagListPage from './pages/TagListPage.svelte';
import TagPage from './pages/TagPage.svelte';
import UpdatesPage from './pages/UpdatesPage.svelte';
import ReferenceLayout from './ReferenceLayout.svelte';
import { referenceHooks, registerRenderers, type ReferenceRenderer } from './renderers.js';
import { createReferenceTheme, type ReferenceThemeConfig, type ReferenceThemeIdentity } from './theme.js';

export interface ReferenceThemeOptions extends ReferenceThemeIdentity {
	/**
	 * The page renderers, from presets (`apiRenderers`, `mcpRenderers`) or your
	 * own. Each page's metadata picks one; pages without reference metadata are
	 * guides. Two different renderers for one id throw.
	 */
	readonly renderers: readonly ReferenceRenderer[];
}

/**
 * A reference theme's runtime manifest: the shared shell with these renderers.
 *
 * ```js
 * // theme/runtime.js
 * import { referenceTheme } from '@svartz/ui/reference/runtime';
 * import { apiRenderers } from '@svartz/theme-api-docs/runtime';
 * import { mcpRenderers } from '@svartz/theme-mcp-docs/runtime';
 *
 * export default (config) =>
 *   referenceTheme({ id: '@acme/docs-theme', renderers: [...apiRenderers, ...mcpRenderers] }, config);
 * ```
 */
export function referenceTheme(options: ReferenceThemeOptions, config?: ReferenceThemeConfig): SvartzTheme {
	const { renderers, ...identity } = options;
	// Every module is eager: lazy pages sharing modules stall the Vite build (#62).
	return createReferenceTheme(
		identity,
		{
			layout: { default: ReferenceLayout },
			notFoundPage: { default: NotFoundPage },
			referencePage: { default: ReferencePage },
			resourcePage: { default: ResourcePage },
			tagListPage: { default: TagListPage },
			tagPage: { default: TagPage },
			updatesPage: { default: UpdatesPage },
			components: { ...svartzContentComponents, searchBox: { default: SearchDialog }, comments: { default: Comments } },
			hooks: referenceHooks(registerRenderers(identity.id, renderers))
		},
		config
	);
}

export * from './shared.js';
export { schemaRenderer } from './schema-renderer.js';
export { default as AuthSummary } from './AuthSummary.svelte';
export { default as Badge } from './Badge.svelte';
export { default as CodePanel } from './CodePanel.svelte';
export { default as EndpointBar } from './EndpointBar.svelte';
export { default as ReferenceLayout } from './ReferenceLayout.svelte';
export { default as ReferenceNav } from './ReferenceNav.svelte';
export { default as ReferenceSection } from './ReferenceSection.svelte';
export { default as SchemaTree } from './SchemaTree.svelte';
export { default as SourceLinks } from './SourceLinks.svelte';
