<script lang="ts">
	import type { Snippet } from 'svelte';
	import {
		Backlinks,
		Breadcrumbs,
		FileTrie,
		GraphPanel,
		NoteHeader,
		SearchBox,
		TableOfContents
	} from '@svartz/ui';

	type TocEntry = { depth: number; text: string; slug: string };
	type Entry = {
		slug: string;
		title: string;
		description?: string;
		createdAt?: Date;
		modifiedAt?: Date;
		tags?: readonly string[];
		toc?: readonly TocEntry[];
	};

	type Index = {
		entries: readonly Entry[];
		backlinks: Record<string, readonly string[]>;
		graph: Record<string, readonly string[]>;
	};

	let {
		children,
		entry,
		index = { entries: [], backlinks: {}, graph: {} },
		backlinks = {},
		graph = {},
		match,
		searchDocuments = [],
		searchIndex
	}: {
		children?: Snippet;
		entry?: Entry;
		index?: Index;
		backlinks?: Record<string, readonly string[]>;
		graph?: Record<string, readonly string[]>;
		match?: { pathname?: string; params?: { slug?: string } };
		searchDocuments?: readonly {
			id: string;
			slug: string;
			title: string;
			description?: string;
		}[];
		searchIndex?: unknown;
	} = $props();

	function pathnameToSlug(pathname: string | undefined): string | undefined {
		if (!pathname || pathname === '/') return 'index';
		return pathname.replace(/^\/+|\/+$/g, '');
	}

	const breadcrumbSlug = $derived(pathnameToSlug(match?.pathname));
</script>

<div class="shell">
	<aside class="left-sidebar">
		<SearchBox {searchDocuments} {searchIndex} />
		<FileTrie entries={index.entries} />
	</aside>

	<div class="content-column">
		<Breadcrumbs slug={breadcrumbSlug} />
		{#if entry}
			<NoteHeader {entry} />
		{/if}
		<section class="page-body">
			{@render children?.()}
		</section>
	</div>

	<aside class="right-sidebar">
		<TableOfContents items={entry?.toc} />
		<GraphPanel currentSlug={entry?.slug} entries={index.entries} {graph} />
		<Backlinks currentSlug={entry?.slug} entries={index.entries} {backlinks} />
	</aside>
</div>

<style>
	:global(body) {
		background: #0f1117;
		color: #f8fafc;
	}

	.shell {
		display: grid;
		grid-template-columns: minmax(14rem, 18rem) minmax(0, 1fr) minmax(14rem, 18rem);
		gap: 2rem;
		max-width: 90rem;
		margin: 0 auto;
		padding: 1.5rem;
	}

	.left-sidebar,
	.right-sidebar,
	.content-column {
		display: grid;
		align-content: start;
		gap: 1.25rem;
	}

	.left-sidebar,
	.right-sidebar {
		position: sticky;
		top: 1rem;
		max-height: calc(100vh - 2rem);
		overflow: auto;
	}

	.content-column {
		min-width: 0;
	}

	.page-body {
		background: rgba(255, 255, 255, 0.02);
		border: 1px solid rgba(255, 255, 255, 0.06);
		border-radius: 1rem;
		padding: clamp(1rem, 3vw, 2rem);
	}

	.page-body :global(h1),
	.page-body :global(h2),
	.page-body :global(h3),
	.page-body :global(h4) {
		line-height: 1.2;
	}

	.page-body :global(a) {
		color: #c4b5fd;
	}

	.page-body :global(pre) {
		overflow: auto;
		padding: 1rem;
		border-radius: 0.75rem;
		background: rgba(15, 23, 42, 0.9);
	}

	.page-body :global(blockquote) {
		margin: 1rem 0;
		padding: 0.85rem 1rem;
		border-left: 3px solid rgba(196, 181, 253, 0.75);
		background: rgba(255, 255, 255, 0.03);
	}

	.page-body :global(mark) {
		background: rgba(250, 204, 21, 0.18);
		color: inherit;
	}

	@media (max-width: 1100px) {
		.shell {
			grid-template-columns: 1fr;
		}

		.left-sidebar,
		.right-sidebar {
			position: static;
			max-height: none;
		}
	}
</style>
