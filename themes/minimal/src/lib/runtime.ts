import { defineTheme } from '@svartz/core';
import { Comments, SearchDialog, svartzContentComponents } from '@svartz/ui';
import Backlinks from './components/Backlinks.svelte';
import Graph from './components/Graph.svelte';
import Toc from './components/Toc.svelte';
import { composeRuntimeTheme, minimalExtension, type ThemeIdentity } from './compose.js';
import type { ThemeExtension } from './extension.js';
import SiteLayout from './layouts/SiteLayout.svelte';
import type { MinimalThemeConfig, MinimalThemeModules } from './manifest.js';
import FeedPage from './pages/FeedPage.svelte';
import FolderListPage from './pages/FolderListPage.svelte';
import FolderPage from './pages/FolderPage.svelte';
import NotFoundPage from './pages/NotFoundPage.svelte';
import TagListPage from './pages/TagListPage.svelte';
import TagPage from './pages/TagPage.svelte';

// Every page is eager: a lazy page sharing modules with eager ones stalls the Vite build (#62).
const modules: MinimalThemeModules = {
	siteLayout: { default: SiteLayout },
	notFoundPage: { default: NotFoundPage },
	tagListPage: { default: TagListPage },
	tagPage: { default: TagPage },
	folderListPage: { default: FolderListPage },
	folderPage: { default: FolderPage },
	feedPage: { default: FeedPage },
	components: {
		...svartzContentComponents,
		searchBox: { default: SearchDialog },
		comments: { default: Comments },
		backlinks: { default: Backlinks },
		graphPanel: { default: Graph },
		toc: { default: Toc }
	}
};

/**
 * A runtime manifest that composes themes on minimal's shell. The first theme
 * styles the site; each page renders with the theme that claims it.
 *
 * ```js
 * // theme/runtime.js
 * import { composeThemes } from '@svartz/theme-minimal/runtime';
 * import { extensions as api } from '@svartz/theme-api-docs/runtime';
 * import { extensions as mcp } from '@svartz/theme-mcp-docs/runtime';
 * export default (config) => composeThemes([...api, ...mcp], config, { id: '@acme/docs-theme' });
 * ```
 */
export const composeThemes = (extensions: readonly ThemeExtension[], config?: MinimalThemeConfig, identity?: ThemeIdentity) =>
	composeRuntimeTheme(modules, extensions, config, identity);

/** Minimal's own extension: the base every theme extends. */
export const extensions: readonly ThemeExtension[] = [minimalExtension];

/** Vite-bundled runtime manifest. Lazy entries load before SSR and hydration. */
const theme = defineTheme((config?: MinimalThemeConfig) => composeThemes(extensions, config));

export { definePageRenderer } from './extension.js';
export type * from './extension.js';
export { minimalExtension, type ThemeIdentity } from './compose.js';
export { ThemeSelectionError } from './select.js';
export { theme };
export default theme;
