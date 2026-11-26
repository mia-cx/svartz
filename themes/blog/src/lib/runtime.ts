import { defineTheme } from '@svartz/core';
import { composeThemes, type ThemeExtension } from '@svartz/theme-minimal/runtime';
import { readPost } from './blog.js';
import { blogIdentity, type BlogThemeConfig } from './manifest.js';
import ArchivePage from './pages/ArchivePage.svelte';
import FolderListPage from './pages/FolderListPage.svelte';
import FolderPage from './pages/FolderPage.svelte';
import HomePage from './pages/HomePage.svelte';
import TagPage from './pages/TagPage.svelte';
import TagsPage from './pages/TagsPage.svelte';
import BlogFooter from './shell/BlogFooter.svelte';
import BlogFrame from './shell/BlogFrame.svelte';
import BlogHeader from './shell/BlogHeader.svelte';
import PostFoot from './shell/PostFoot.svelte';
import PostHead from './shell/PostHead.svelte';
import RelatedPosts from './shell/RelatedPosts.svelte';

/**
 * The blog on minimal's shell: a top header instead of the explorer, posts in
 * one reading column with related posts below, and post grids for the list
 * pages.
 */
export const extensions: readonly ThemeExtension[] = [
	{
		...blogIdentity,
		frame: BlogFrame,
		regions: { header: BlogHeader, pageHead: PostHead, pageFoot: PostFoot, aside: RelatedPosts, footer: BlogFooter },
		pages: { home: HomePage, tags: TagsPage, tag: TagPage, feed: ArchivePage, folders: FolderListPage, folder: FolderPage },
		chrome: { breadcrumbs: false, graph: false, backlinks: false, readerMode: false },
		// A post's byline names its own `author` ahead of the site's.
		structuredData: (article, { entry }) => {
			if (entry.slug === 'index') return article;
			const { author } = readPost(entry.properties);
			return { ...article, '@type': 'BlogPosting', ...(author && { author: { '@type': 'Person', name: author } }) };
		}
	}
];

/** Vite-bundled runtime manifest. */
const theme = defineTheme((config?: BlogThemeConfig) => composeThemes(extensions, config));

export { theme };
export default theme;
