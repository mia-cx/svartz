import { defineTheme } from '@svartz/core';
import { composeThemes, definePageRenderer, type ThemeExtension } from '@svartz/theme-minimal/runtime';
import SymbolPage from './components/SymbolPage.svelte';
import { docsIdentity, type DocsThemeConfig } from './manifest.js';
import HomePage from './pages/HomePage.svelte';
import ModuleListPage from './pages/ModuleListPage.svelte';
import ModulePage from './pages/ModulePage.svelte';
import TagListPage from './pages/TagListPage.svelte';
import TagPage from './pages/TagPage.svelte';
import UpdatesPage from './pages/UpdatesPage.svelte';
import DocsFrame from './shell/DocsFrame.svelte';
import OnThisPage from './shell/OnThisPage.svelte';
import PageFooter from './shell/PageFooter.svelte';
import PageHead from './shell/PageHead.svelte';
import TopBar from './shell/TopBar.svelte';
import { readSymbol, symbolExplorerItem } from './symbols.js';

/** A note with `symbol` frontmatter: its kind badge in the explorer, its generated reference, and its sections in "On this page". */
const symbolRenderer = definePageRenderer({
	id: 'symbol',
	detect: (properties) => readSymbol(properties),
	explorerItem: symbolExplorerItem,
	body: SymbolPage,
	aside: OnThisPage
});

/** Package reference docs on minimal's shell: a top bar, the reference explorer, and "On this page". */
const docs: ThemeExtension = {
	...docsIdentity,
	frame: DocsFrame,
	regions: { header: TopBar, pageHead: PageHead, aside: OnThisPage, footer: PageFooter },
	renderers: [symbolRenderer],
	pages: { home: HomePage, tags: TagListPage, tag: TagPage, feed: UpdatesPage, folders: ModuleListPage, folder: ModulePage },
	chrome: { graph: false, backlinks: false, dates: false, readerMode: false }
};

export const extensions: readonly ThemeExtension[] = [docs];

/** Vite-bundled runtime manifest. */
const theme = defineTheme((config?: DocsThemeConfig) => composeThemes(extensions, config));

export { theme };
export default theme;
