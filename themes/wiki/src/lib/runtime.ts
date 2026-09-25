import { defineTheme } from '@svartz/core';
import { Comments, SearchDialog, svartzContentComponents } from '@svartz/ui';
import Infobox from './components/Infobox.svelte';
import WikiLayout from './layouts/WikiLayout.svelte';
import { createWikiTheme, type WikiThemeConfig, type WikiThemeModules } from './manifest.js';
import AllPagesPage from './pages/AllPagesPage.svelte';
import CategoryIndexPage from './pages/CategoryIndexPage.svelte';
import CategoryPage from './pages/CategoryPage.svelte';
import FolderPage from './pages/FolderPage.svelte';
import NotFoundPage from './pages/NotFoundPage.svelte';
import RecentChangesPage from './pages/RecentChangesPage.svelte';

// Every module is eager: lazy pages sharing modules stall the Vite build (#62).
const modules: WikiThemeModules = {
	layout: { default: WikiLayout },
	notFoundPage: { default: NotFoundPage },
	categoryIndexPage: { default: CategoryIndexPage },
	categoryPage: { default: CategoryPage },
	allPagesPage: { default: AllPagesPage },
	folderPage: { default: FolderPage },
	recentChangesPage: { default: RecentChangesPage },
	components: {
		...svartzContentComponents,
		searchBox: { default: SearchDialog },
		comments: { default: Comments },
		infobox: { default: Infobox }
	}
};

/** Vite-bundled runtime manifest. */
const theme = defineTheme((config?: WikiThemeConfig) => createWikiTheme(modules, config));

export { theme };
export default theme;
