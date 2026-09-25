import { defineTheme } from '@svartz/core';
import { Comments, SearchDialog, svartzContentComponents } from '@svartz/ui';
import PostCard from './components/PostCard.svelte';
import BlogLayout from './layouts/BlogLayout.svelte';
import { createBlogTheme, type BlogThemeConfig, type BlogThemeModules } from './manifest.js';
import ArchivePage from './pages/ArchivePage.svelte';
import FolderListPage from './pages/FolderListPage.svelte';
import FolderPage from './pages/FolderPage.svelte';
import HomePage from './pages/HomePage.svelte';
import NotFoundPage from './pages/NotFoundPage.svelte';
import TagPage from './pages/TagPage.svelte';
import TagsPage from './pages/TagsPage.svelte';

// Every module is eager: lazy pages sharing modules stall the Vite build (#62).
const modules: BlogThemeModules = {
	layout: { default: BlogLayout },
	homePage: { default: HomePage },
	notFoundPage: { default: NotFoundPage },
	tagsPage: { default: TagsPage },
	tagPage: { default: TagPage },
	archivePage: { default: ArchivePage },
	folderListPage: { default: FolderListPage },
	folderPage: { default: FolderPage },
	components: {
		...svartzContentComponents,
		searchBox: { default: SearchDialog },
		comments: { default: Comments },
		postCard: { default: PostCard }
	}
};

/** Vite-bundled runtime manifest. */
const theme = defineTheme((config?: BlogThemeConfig) => createBlogTheme(modules, config));

export { theme };
export default theme;
