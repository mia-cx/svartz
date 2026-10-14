import { defineTheme } from '@svartz/core';
import { Comments, SearchDialog, svartzContentComponents } from '@svartz/ui';
import ApiLayout from './layouts/ApiLayout.svelte';
import { createApiDocsTheme, type ApiDocsThemeConfig, type ApiDocsThemeModules } from './manifest.js';
import NotFoundPage from './pages/NotFoundPage.svelte';
import ReferencePage from './pages/ReferencePage.svelte';
import ResourcePage from './pages/ResourcePage.svelte';
import TagListPage from './pages/TagListPage.svelte';
import TagPage from './pages/TagPage.svelte';
import UpdatesPage from './pages/UpdatesPage.svelte';

// Every module is eager: lazy pages sharing modules stall the Vite build (#62).
const modules: ApiDocsThemeModules = {
	layout: { default: ApiLayout },
	notFoundPage: { default: NotFoundPage },
	referencePage: { default: ReferencePage },
	resourcePage: { default: ResourcePage },
	tagListPage: { default: TagListPage },
	tagPage: { default: TagPage },
	updatesPage: { default: UpdatesPage },
	components: {
		...svartzContentComponents,
		searchBox: { default: SearchDialog },
		comments: { default: Comments }
	}
};

/** Vite-bundled runtime manifest. */
const theme = defineTheme((config?: ApiDocsThemeConfig) => createApiDocsTheme(modules, config));

export { theme };
export default theme;
