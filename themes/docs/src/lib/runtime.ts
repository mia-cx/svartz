import { defineTheme } from '@svartz/core';
import { Comments, SearchDialog, svartzContentComponents } from '@svartz/ui';
import SymbolReference from './components/SymbolReference.svelte';
import DocsLayout from './layouts/DocsLayout.svelte';
import { createDocsTheme, type DocsThemeConfig, type DocsThemeModules } from './manifest.js';
import ModuleListPage from './pages/ModuleListPage.svelte';
import ModulePage from './pages/ModulePage.svelte';
import NotFoundPage from './pages/NotFoundPage.svelte';
import TagListPage from './pages/TagListPage.svelte';
import TagPage from './pages/TagPage.svelte';
import UpdatesPage from './pages/UpdatesPage.svelte';

// Every module is eager: lazy pages sharing modules stall the Vite build (#62).
const modules: DocsThemeModules = {
	layout: { default: DocsLayout },
	notFoundPage: { default: NotFoundPage },
	moduleListPage: { default: ModuleListPage },
	modulePage: { default: ModulePage },
	tagListPage: { default: TagListPage },
	tagPage: { default: TagPage },
	updatesPage: { default: UpdatesPage },
	components: {
		...svartzContentComponents,
		searchBox: { default: SearchDialog },
		comments: { default: Comments },
		symbolReference: { default: SymbolReference }
	}
};

/** Vite-bundled runtime manifest. */
const theme = defineTheme((config?: DocsThemeConfig) => createDocsTheme(modules, config));

export { theme };
export default theme;
