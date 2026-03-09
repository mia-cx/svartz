export const TEST_NOTE_ARTIFACT_KEY = 'pages/index.svelte';

export const testRoutes = [
	{ id: 'home', pattern: '/', layoutSlot: 'notePage' },
	{ id: 'tag', pattern: '/tags/:slug', layoutSlot: 'tagPage' },
	{ id: 'folder', pattern: '/folders/:slug', layoutSlot: 'folderPage' }
] as const;

export const testIndex = {
	version: '1.0.0',
	entries: [
		{
			slug: 'index',
			path: 'index.md',
			title: 'Svartz test page',
			tags: [],
			aliases: [],
			description: 'Runtime shell test page.',
			content: 'Runtime shell test page.',
			links: [],
			toc: [],
			wordCount: 3,
			readingTimeMinutes: 1,
			createdAt: new Date('2026-01-01T00:00:00.000Z'),
			modifiedAt: new Date('2026-01-01T00:00:00.000Z')
		}
	],
	graph: { index: [] },
	backlinks: { index: [] },
	search: [],
	tags: [{ slug: 'testing', title: 'Testing', noteCount: 1, href: '/tags/testing/' }],
	folders: [{ slug: 'guides', title: 'Guides', noteCount: 1, href: '/folders/guides/' }],
	routes: {
		notes: ['/', '/guides/intro/'],
		tags: ['/tags/', '/tags/testing/'],
		folders: ['/folders/', '/folders/guides/'],
		feed: ['/feed/'],
		all: ['/', '/feed/', '/folders/', '/folders/guides/', '/guides/intro/', '/tags/', '/tags/testing/']
	},
	assets: []
} as const;
