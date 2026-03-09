<script lang="ts">
	import { page } from '$app/state';
	import SiteLayout from '$lib/layouts/SiteLayout.svelte';

	const entry = {
		slug: 'example-note',
		title: 'Example note',
		description: 'A demo note that uses every UI component in the layout.',
		createdAt: new Date('2025-01-10'),
		modifiedAt: new Date('2025-03-07'),
		tags: ['demo', 'theme', 'svartz'],
		wordCount: 820,
		toc: [
			{ depth: 1, text: 'Introduction', slug: 'introduction' },
			{ depth: 2, text: 'Components used', slug: 'components-used' },
			{ depth: 1, text: 'Conclusion', slug: 'conclusion' },
		],
	};

	const index = {
		entries: [
			{ slug: 'index', path: 'index', title: 'Home' },
			{ slug: 'example-note', path: 'example-note', title: 'Example note' },
			{ slug: 'other', path: 'other', title: 'Another note' },
		],
		backlinks: {
			'example-note': ['index', 'other'],
		} as Record<string, readonly string[]>,
		graph: {
			index: ['example-note', 'other'],
			'example-note': ['index', 'other'],
			other: ['example-note'],
		} as Record<string, readonly string[]>,
	};

	const searchDocuments = [
		{
			id: '1',
			slug: 'index',
			title: 'Home',
			description: 'Welcome to the vault.',
			content: 'The home page of this digital garden. Browse notes by tag, folder, or use the search box to find anything quickly.',
			tags: ['home', 'overview']
		},
		{
			id: '2',
			slug: 'example-note',
			title: 'Example note',
			description: entry.description,
			content: 'A demo note showcasing all layout components: SearchBox, FileTrie, Breadcrumbs, NoteHeader with reading time, TableOfContents, GraphPanel, and Backlinks.',
			tags: ['demo', 'theme', 'svartz']
		},
		{
			id: '3',
			slug: 'other',
			title: 'Another note',
			description: 'A second note to demonstrate graph connections and backlinks.',
			content: 'This note links back to the example note and the home page, demonstrating how the graph panel and backlinks section populate with real connections.',
			tags: ['demo', 'graph']
		},
	];
</script>

<SiteLayout
	{entry}
	index={index}
	backlinks={index.backlinks}
	graph={index.graph}
	{searchDocuments}
	match={{ pathname: page.url.pathname, params: { slug: entry.slug } }}
>
	<article>
		<h2 id="introduction">Introduction</h2>
		<p>
			This page is the <strong>example note</strong> route. It uses <strong>SiteLayout</strong> with
			full mock data so you can dev all components at once: SearchBox, FileTrie, Breadcrumbs,
			NoteHeader, TableOfContents, GraphPanel, and Backlinks.
		</p>

		<h2 id="components-used">Components used</h2>
		<ul>
			<li><strong>Left sidebar:</strong> SearchBox, FileTrie (explorer)</li>
			<li><strong>Content:</strong> Breadcrumbs, NoteHeader, and this body</li>
			<li><strong>Right sidebar:</strong> TableOfContents, GraphPanel, Backlinks</li>
		</ul>

		<h2 id="conclusion">Conclusion</h2>
		<p>Resize the window to test the layout breakpoints (82rem, 62rem).</p>
	</article>
</SiteLayout>
