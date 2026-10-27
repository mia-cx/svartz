import { defineTheme } from '@svartz/core';
import type { MinimalThemeConfig } from '@svartz/theme-minimal';
import { composeThemes, definePageRenderer, type ThemeExtension } from '@svartz/theme-minimal/runtime';
import Article from './components/Article.svelte';
import { wikiIdentity } from './manifest.js';
import AllPagesPage from './pages/AllPagesPage.svelte';
import CategoryIndexPage from './pages/CategoryIndexPage.svelte';
import CategoryPage from './pages/CategoryPage.svelte';
import FolderPage from './pages/FolderPage.svelte';
import MainPage from './pages/MainPage.svelte';
import RecentChangesPage from './pages/RecentChangesPage.svelte';
import ArticleFoot from './shell/ArticleFoot.svelte';
import PageHead from './shell/PageHead.svelte';
import Rail from './shell/Rail.svelte';
import WikiFrame from './shell/WikiFrame.svelte';
import WikiHeader from './shell/WikiHeader.svelte';
import { readArticle } from './wiki.js';

/** A note with an `infobox` or a `hatnote` renders as a wiki article, in any composed site. */
const infobox = definePageRenderer({ id: 'infobox', detect: readArticle, body: Article });

/** The wiki on theme-minimal's shell: its header, rail, article head and foot, article renderer, and list pages. */
export const extensions: readonly ThemeExtension[] = [
	{
		...wikiIdentity,
		frame: WikiFrame,
		regions: { header: WikiHeader, navigation: Rail, pageHead: PageHead, pageFoot: ArticleFoot },
		renderers: [infobox],
		pages: {
			home: MainPage,
			tags: CategoryIndexPage,
			tag: CategoryPage,
			feed: RecentChangesPage,
			folders: AllPagesPage,
			folder: FolderPage
		},
		// The rail's contents and the article foot's "What links here" stand in for these.
		chrome: { graph: false, backlinks: false, dates: false, readerMode: false, pageNav: false }
	}
];

/** Vite-bundled runtime manifest. */
const theme = defineTheme((config?: MinimalThemeConfig) => composeThemes(extensions, config));

export { theme };
export default theme;
