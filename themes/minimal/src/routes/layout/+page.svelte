<script lang="ts">
	import { page } from '$app/state';
	import SiteLayout from '$lib/layouts/SiteLayout.svelte';

	const index = {
		entries: [
			{ slug: 'index', path: 'index', title: 'Home' },
			{ slug: 'about', path: 'about', title: 'About' },
			{ slug: 'docs/getting-started', path: 'docs/getting-started', title: 'Getting Started' },
			{ slug: 'docs/configuration', path: 'docs/configuration', title: 'Configuration' },
		],
		backlinks: {} as Record<string, readonly string[]>,
		graph: {} as Record<string, readonly string[]>,
	};

	const searchDocuments = [
		{
			id: '1',
			slug: 'index',
			title: 'Home',
			description: 'Welcome to this vault.',
			content: 'Browse notes, explore the file tree, or use the search box to find anything.',
			tags: ['home']
		},
		{
			id: '2',
			slug: 'about',
			title: 'About',
			description: 'About this digital garden.',
			content: 'A minimal Svartz-powered site. Built with SvelteKit and Tailwind CSS.',
			tags: ['about', 'meta']
		},
		{
			id: '3',
			slug: 'docs/getting-started',
			title: 'Getting Started',
			description: 'How to set up and run your first vault.',
			content: 'Install the Svartz CLI, point it at a directory of Markdown files, and run pnpm dev to start the development server.',
			tags: ['docs', 'install', 'quickstart']
		},
		{
			id: '4',
			slug: 'docs/configuration',
			title: 'Configuration',
			description: 'Available configuration options.',
			content: 'Configure vault path, output directory, theme, plugins, and build settings via svartz.config.ts.',
			tags: ['docs', 'config', 'settings']
		},
	];
</script>

<SiteLayout
	index={index}
	backlinks={index.backlinks}
	graph={index.graph}
	searchDocuments={searchDocuments}
	match={{ pathname: page.url.pathname, params: {} }}
>
	<p>This route shows <strong>SiteLayout</strong> with minimal data: left sidebar (SearchBox, FileTrie), content (Breadcrumbs, this body), right sidebar (ToC, GraphPanel, Backlinks) empty.</p>
</SiteLayout>
