import { defineTheme, type ThemeComponentLoader } from '@svartz/core';

type ComponentModule = { default: unknown };

const lazyComponent = (moduleId: string): ThemeComponentLoader => {
	return (() => import(moduleId)) as () => Promise<ComponentModule>;
};

const lazyNamedComponent = (moduleId: string, exportName: string): ThemeComponentLoader => {
	return (() =>
		import(moduleId).then((module) => ({
			default: (module as Record<string, unknown>)[exportName]
		}))) as () => Promise<ComponentModule>;
};

export const theme = defineTheme({
	id: '@svartz/theme-minimal',
	displayName: 'Svartz Minimal',
	description: 'Quartz-like starter theme for Svartz static vault sites.',
	version: '0.0.1',
	contractVersion: '1.0.0',
	layouts: {
		defaultPage: lazyComponent('./layouts/SiteLayout.svelte'),
		notePage: lazyComponent('./layouts/SiteLayout.svelte'),
		tagPage: lazyComponent('./layouts/SiteLayout.svelte'),
		folderPage: lazyComponent('./layouts/SiteLayout.svelte'),
		notFoundPage: lazyComponent('./pages/NotFoundPage.svelte')
	},
	routes: [
		{ id: 'home', pattern: '/', layoutSlot: 'notePage', priority: 100 },
		{
			id: 'tags-index',
			pattern: '/tags',
			layoutSlot: 'defaultPage',
			component: lazyComponent('./pages/TagListPage.svelte'),
			priority: 90
		},
		{
			id: 'tag',
			pattern: '/tags/:slug',
			layoutSlot: 'tagPage',
			component: lazyComponent('./pages/TagPage.svelte'),
			priority: 80
		},
		{
			id: 'folders-index',
			pattern: '/folders',
			layoutSlot: 'defaultPage',
			component: lazyComponent('./pages/FolderListPage.svelte'),
			priority: 70
		},
		{
			id: 'folder',
			pattern: '/folders/:slug',
			layoutSlot: 'folderPage',
			component: lazyComponent('./pages/FolderPage.svelte'),
			priority: 60
		},
		{ id: 'note', pattern: '/:slug', layoutSlot: 'notePage', priority: 10 }
	],
	components: {
		backlinks: lazyNamedComponent('@svartz/ui', 'Backlinks'),
		graphPanel: lazyNamedComponent('@svartz/ui', 'GraphPanel'),
		searchBox: lazyNamedComponent('@svartz/ui', 'SearchBox'),
		toc: lazyNamedComponent('@svartz/ui', 'TableOfContents'),
		noteHeader: lazyNamedComponent('@svartz/ui', 'NoteHeader')
	},
	capabilities: {
		embeds: true,
		codeBlocks: true,
		syntaxHighlighting: true,
		math: true,
		toc: true,
		backlinks: true,
		graph: true,
		search: true
	},
	artifactRequirements: {
		index: true,
		graph: true,
		backlinks: true
	}
})();

export default theme;
