<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { VaultView } from '@svartz/core';
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
		term?: string;
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
		href?: string;
		page?: { toc: boolean; comments: boolean };
		path?: string;
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
		match,
		searchDocuments = [],
		searchIndex,
		searchOptions = { fields: [], storeFields: [], idField: 'id' },
		vault,
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
			href?: string;
			title: string;
			description?: string;
			content?: string;
			tags?: readonly string[];
		}[];
		searchIndex?: unknown;
		searchOptions?: { fields: string[]; storeFields: string[]; idField: string };
		vault?: VaultView;
		themeConfig?: Record<string, unknown>;
	} = $props();

	const cfg = $derived(themeConfig as MinimalThemeConfig);

	const commentsEnabled = $derived(
		!!entry &&
			!!cfg.comments?.repo &&
			!!cfg.comments?.repoId &&
			!!cfg.comments?.category &&
			!!cfg.comments?.categoryId &&
			cfg.comments?.enabled !== false &&
			entry?.page?.comments !== false
	);

	const recentNotesEnabled = $derived(cfg.recentNotes?.enabled !== false);

	function pathnameToSlug(pathname: string | undefined): string | undefined {
		if (!pathname || pathname === '/') return 'index';
		return pathname.replace(/^\/+|\/+$/g, '');
	}

	const breadcrumbSlug = $derived(entry?.slug ?? pathnameToSlug(match?.params?.slug));
	const visibleEntries = $derived(vault?.entries ?? index.entries);
	const homeHref = $derived(vault?.routes.mountPath ? `${vault.routes.mountPath}/` : '/');
</script>

<a
	class="skip-link"
	href="#main-content"
	tabindex="0"
	aria-label="Skip to main content"
	onkeydown={(event) => {
		if (event.key !== ' ') return;
		event.preventDefault();
		event.currentTarget.click();
	}}
>Skip to content</a>
<div class="shell">
	<aside class="left-sidebar" aria-label="Site navigation">
		<SearchBox searchDocuments={vault?.search ?? searchDocuments} {searchIndex} {searchOptions} />
		<FileTrie
			entries={visibleEntries}
			folders={vault?.folders ?? []}
			currentSlug={breadcrumbSlug}
		/>
	</aside>

	<main class="content-column" id="main-content" tabindex="-1">
		<Breadcrumbs slug={breadcrumbSlug} entries={visibleEntries} {homeHref} folders={vault?.folders} />
		{#if entry}
			<NoteHeader {entry} tags={vault?.tags} />
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
				term={cfg.comments!.term}
				strict={cfg.comments!.strict}
				reactionsEnabled={cfg.comments!.reactionsEnabled}
				inputPosition={cfg.comments!.inputPosition}
				lang={cfg.comments!.lang}
				lightTheme={cfg.comments!.lightTheme}
				darkTheme={cfg.comments!.darkTheme}
			/>
		{/if}
	</main>

	<aside class="right-sidebar" aria-label="Related content">
		<TableOfContents items={entry?.page?.toc === false ? [] : entry?.toc} />
		{#if entry}
			<GraphPanel currentSlug={entry.slug} entries={visibleEntries} graph={vault?.graph ?? graph} />
		{/if}
		{#if recentNotesEnabled}
			<RecentNotes
				entries={visibleEntries}
				tags={vault?.tags ?? []}
				limit={cfg.recentNotes?.limit ?? 5}
				showTags={cfg.recentNotes?.showTags ?? true}
				linkToMore={cfg.recentNotes?.linkToMore ?? vault?.routes.feed[0] ?? '/feed/'}
			/>
		{/if}
		<Backlinks currentSlug={entry?.slug} entries={visibleEntries} {backlinks} />
	</aside>
</div>

<style>
	:global(body) {
		--page-bg: oklch(0.985 0 0);
		--page-fg: oklch(0.21 0.006 285);
		--page-border: oklch(0.92 0.004 286);
		--page-link: oklch(0.49 0.26 294);
		--page-quote-bg: oklch(0.967 0.001 286);
		--page-callout-border: oklch(0.87 0.07 294);
		--page-warning: oklch(0.47 0.13 48);
		--page-code-bg: oklch(0.21 0.006 285);
		--page-code-fg: oklch(0.985 0 0);
		background: var(--page-bg);
		color: var(--page-fg);
	}

	@media (prefers-color-scheme: dark) {
		:global(body) {
			--page-bg: oklch(0.21 0.006 285);
			--page-fg: oklch(0.985 0 0);
			--page-border: oklch(0.37 0.013 285);
			--page-link: oklch(0.77 0.14 294);
			--page-quote-bg: oklch(0.274 0.006 286);
			--page-callout-border: oklch(0.48 0.09 294);
			--page-warning: oklch(0.8 0.1 75);
			--page-code-bg: oklch(0.274 0.006 286);
		}
	}

	.skip-link {
		position: fixed;
		top: 0.75rem;
		left: 0.75rem;
		z-index: 50;
		transform: translateY(-200%);
		border-radius: 0.5rem;
		background: oklch(0.984 0.003 247);
		color: oklch(0.208 0.042 266);
		padding: 0.6rem 0.85rem;
		font-weight: 600;
	}

	.skip-link:focus {
		transform: translateY(0);
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
		width: min(100%, 52rem);
		min-width: 0;
		justify-self: center;
	}

	.right-sidebar {
		grid-area: right;
	}

	.page-body {
		min-width: 0;
		padding: clamp(0.25rem, 1vw, 0.75rem) 0;
	}

	.page-body :global(h1),
	.page-body :global(h2),
	.page-body :global(h3),
	.page-body :global(h4) {
		line-height: 1.2;
		font-weight: 700;
		letter-spacing: -0.02em;
		text-wrap: balance;
	}

	.page-body :global(h1) {
		margin: 0 0 1.25rem;
		font-size: clamp(1.8rem, 4vw, 2.35rem);
	}

	.page-body :global(h2) {
		margin: 2.75rem 0 0.9rem;
		font-size: clamp(1.4rem, 3vw, 1.75rem);
	}

	.page-body :global(h3) {
		margin: 2rem 0 0.7rem;
		font-size: 1.2rem;
	}

	.page-body :global(h4) {
		margin: 1.5rem 0 0.5rem;
		font-size: 1rem;
	}

	.page-body :global(p),
	.page-body :global(ul),
	.page-body :global(ol) {
		margin: 0.85rem 0;
	}

	.page-body :global(ul),
	.page-body :global(ol) {
		padding-left: 1.4rem;
	}

	.page-body :global(ul) {
		list-style: disc;
	}

	.page-body :global(ol) {
		list-style: decimal;
	}

	.page-body :global(li) {
		margin: 0.35rem 0;
		padding-left: 0.15rem;
	}

	.page-body :global(hr) {
		margin: 2.5rem 0;
		border: 0;
		border-top: 1px solid var(--page-border);
	}

	.page-body :global(a) {
		color: var(--page-link);
	}

	.page-body :global(pre) {
		max-width: 100%;
		overflow: auto;
		padding: 1rem;
		border-radius: 0.75rem;
		background: var(--page-code-bg);
		color: var(--page-code-fg);
	}

	.page-body :global(blockquote) {
		margin: 1rem 0;
		padding: 0.85rem 1rem;
		border-left: 3px solid oklch(0.606 0.25 293);
		background: var(--page-quote-bg);
	}

	.page-body :global(blockquote:has(.callout-marker)) {
		border: 1px solid var(--page-callout-border);
		border-left: 3px solid oklch(0.606 0.25 293);
		border-radius: 0.6rem;
	}

	.page-body :global(.callout-marker + strong) {
		display: inline-block;
		margin-bottom: 0.35rem;
		color: var(--page-link);
	}

	.page-body :global(.callout-marker[data-callout='warning'] + strong),
	.page-body :global(.callout-marker[data-callout='caution'] + strong) {
		color: var(--page-warning);
	}

	.page-body :global(mark) {
		background: oklch(0.84 0.18 95 / 0.18);
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
			padding: clamp(0.75rem, 3vw, 1.25rem);
		}

		.page-body {
			border: 0;
			border-radius: 0;
			background: transparent;
			padding: 0;
		}

		.left-sidebar,
		.right-sidebar {
			position: static;
			max-height: none;
			border-top: 1px solid var(--page-border);
			padding-top: 1.25rem;
		}

		.left-sidebar {
			max-height: min(30vh, 16rem);
		}
	}
</style>
