import { defineTheme } from '@svartz/core';
import { Comments, SearchDialog, svartzContentComponents } from '@svartz/ui';
import Backlinks from './components/Backlinks.svelte';
import Graph from './components/Graph.svelte';
import Toc from './components/Toc.svelte';
import SiteLayout from './layouts/SiteLayout.svelte';
import { createMinimalTheme, type MinimalThemeConfig, type MinimalThemeModules } from './manifest.js';
import FeedPage from './pages/FeedPage.svelte';
import FolderListPage from './pages/FolderListPage.svelte';
import FolderPage from './pages/FolderPage.svelte';
import NotFoundPage from './pages/NotFoundPage.svelte';
import TagListPage from './pages/TagListPage.svelte';

const modules: MinimalThemeModules = {
	siteLayout: { default: SiteLayout },
	// Eager: a lazy page sharing modules with eager ones stalls the Vite build (#62).
	notFoundPage: { default: NotFoundPage },
	tagListPage: { default: TagListPage },
	tagPage: () => import('./pages/TagPage.svelte'),
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

/** Vite-bundled runtime manifest. Lazy entries load before SSR and hydration. */
const theme = defineTheme((config?: MinimalThemeConfig) => createMinimalTheme(modules, config));

export { theme };
export default theme;
