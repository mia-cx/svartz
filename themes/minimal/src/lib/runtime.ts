import { defineTheme } from '@svartz/core';
import {
	Backlinks,
	Comments,
	GraphPanel,
	NoteHeader,
	RecentNotes,
	SearchBox,
	TableOfContents
} from '@svartz/ui';
import SiteLayout from './layouts/SiteLayout.svelte';
import { createMinimalTheme, type MinimalThemeConfig, type MinimalThemeModules } from './manifest.js';
import FeedPage from './pages/FeedPage.svelte';
import FolderListPage from './pages/FolderListPage.svelte';
import FolderPage from './pages/FolderPage.svelte';
import NotFoundPage from './pages/NotFoundPage.svelte';
import TagListPage from './pages/TagListPage.svelte';
import TagPage from './pages/TagPage.svelte';

const modules: MinimalThemeModules = {
	siteLayout: { default: SiteLayout },
	notFoundPage: { default: NotFoundPage },
	tagListPage: { default: TagListPage },
	tagPage: { default: TagPage },
	folderListPage: { default: FolderListPage },
	folderPage: { default: FolderPage },
	feedPage: { default: FeedPage },
	backlinks: { default: Backlinks },
	comments: { default: Comments },
	graphPanel: { default: GraphPanel },
	recentNotes: { default: RecentNotes },
	searchBox: { default: SearchBox },
	toc: { default: TableOfContents },
	noteHeader: { default: NoteHeader }
};

/** Vite-bundled runtime manifest with eager components for SSR and hydration. */
export default defineTheme((config?: MinimalThemeConfig) => createMinimalTheme(modules, config));
