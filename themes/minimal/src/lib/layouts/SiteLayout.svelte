<script lang="ts">
	import type { Snippet } from 'svelte';
	import {
		Backlinks,
		Breadcrumbs,
		Comments,
		FileTrie,
		GraphPanel,
		NoteHeader,
		RecentNotes,
		SearchBox,
		TableOfContents
	} from '@svartz/ui';

	type CommentsConfig = {
		enabled?: boolean;
		repo?: string;
		repoId?: string;
		category?: string;
		categoryId?: string;
		mapping?: 'url' | 'title' | 'og:title' | 'specific' | 'number' | 'pathname';
		strict?: boolean;
		reactionsEnabled?: boolean;
		inputPosition?: 'top' | 'bottom';
		lang?: string;
		lightTheme?: string;
		darkTheme?: string;
	};

	type RecentNotesConfig = {
		enabled?: boolean;
		limit?: number;
		showTags?: boolean;
		linkToMore?: string;
	};

	/** Theme-level config passed from the vault's svartz.config → virtual:svartz/artifacts → here. */
	type MinimalThemeConfig = {
		comments?: CommentsConfig;
		recentNotes?: RecentNotesConfig;
	};

	type TocEntry = { depth: number; text: string; slug: string };
	type Entry = {
		slug: string;
		title: string;
		description?: string;
		createdAt?: Date;
		modifiedAt?: Date;
		tags?: readonly string[];
		toc?: readonly TocEntry[];
		wordCount?: number;
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
		searchIndex,
		themeConfig = {}
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
			content?: string;
			tags?: readonly string[];
		}[];
		searchIndex?: unknown;
		themeConfig?: Record<string, unknown>;
	} = $props();

	const cfg = $derived(themeConfig as MinimalThemeConfig);

	const commentsEnabled = $derived(
		!!cfg.comments?.repo &&
		!!cfg.comments?.repoId &&
		!!cfg.comments?.category &&
		!!cfg.comments?.categoryId &&
		cfg.comments?.enabled !== false
	);

	const recentNotesEnabled = $derived(cfg.recentNotes?.enabled !== false);

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
		{#if commentsEnabled}
			<Comments
				repo={cfg.comments!.repo!}
				repoId={cfg.comments!.repoId!}
				category={cfg.comments!.category!}
				categoryId={cfg.comments!.categoryId!}
				mapping={cfg.comments!.mapping}
				strict={cfg.comments!.strict}
				reactionsEnabled={cfg.comments!.reactionsEnabled}
				inputPosition={cfg.comments!.inputPosition}
				lang={cfg.comments!.lang}
				lightTheme={cfg.comments!.lightTheme}
				darkTheme={cfg.comments!.darkTheme}
			/>
		{/if}
	</div>

	<aside class="right-sidebar">
		<TableOfContents items={entry?.toc} />
		{#if recentNotesEnabled}
			<RecentNotes
				entries={index.entries}
				limit={cfg.recentNotes?.limit ?? 5}
				showTags={cfg.recentNotes?.showTags ?? true}
				linkToMore={cfg.recentNotes?.linkToMore ?? '/feed/'}
			/>
		{/if}
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
		grid-template-areas: 'left content right';
		grid-template-columns: minmax(13rem, 16rem) minmax(0, 1fr) minmax(14rem, 17rem);
		align-items: start;
		gap: clamp(1rem, 2vw, 2rem);
		max-width: 96rem;
		margin: 0 auto;
		padding: clamp(1rem, 2vw, 1.5rem);
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

	.left-sidebar {
		grid-area: left;
	}

	.content-column {
		grid-area: content;
		min-width: 0;
	}

	.right-sidebar {
		grid-area: right;
	}

	.page-body {
		background: rgba(255, 255, 255, 0.02);
		border: 1px solid rgba(255, 255, 255, 0.06);
		border-radius: 1rem;
		min-width: 0;
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
		max-width: 100%;
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

	@media (max-width: 82rem) {
		.shell {
			grid-template-areas:
				'left content'
				'right content';
			grid-template-columns: minmax(13rem, 15rem) minmax(0, 1fr);
		}

		.right-sidebar {
			position: static;
			top: auto;
			max-height: none;
		}
	}

	@media (max-width: 62rem) {
		.shell {
			grid-template-areas:
				'left'
				'content'
				'right';
			grid-template-columns: minmax(0, 1fr);
		}

		.left-sidebar,
		.right-sidebar {
			position: static;
			max-height: none;
		}
	}
</style>
