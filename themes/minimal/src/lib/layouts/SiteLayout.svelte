<!--
	theme-minimal's shell, and every composed theme's. It works out the page's
	theme, the explorer tree, the current folder path, contents, and
	previous/next once, hands that shell state to every region, and lets the
	primary theme swap the frame or any region. A page a theme's renderer
	claims renders through that renderer, its right column included; list pages
	render with the primary theme's, or a folder note's `theme:` for a folder.
-->
<script lang="ts">
	import '@svartz/ui/base.css';
	import '@svartz/ui/prose.css';
	import { afterNavigate } from '$app/navigation';
	import { page } from '$app/state';
	import type { IndexEntry } from '@svartz/core';
	import { buildExplorerTree, Comments, DescText, folderLayout, LinkPreviews, PageActions, themeSettings, type ThemePageProps } from '@svartz/ui';
	import { compositionOf } from '../compose.js';
	import type { ListPageName, RegionName, ShellState, ThemeChrome } from '../extension.js';
	import { choosePage, folderTheme } from '../select.js';
	import { adjacentPages, explorerTrail, readingOrder } from '../shell.js';
	import Explorer from '../components/Explorer.svelte';
	import ColumnsFrame from '../shell/ColumnsFrame.svelte';
	import Masthead from '../shell/Masthead.svelte';
	import PageHead from '../shell/PageHead.svelte';
	import PageNav from '../shell/PageNav.svelte';
	import Related from '../shell/Related.svelte';
	import SiteFooter from '../shell/SiteFooter.svelte';

	let props: ThemePageProps = $props();
	const { children } = $derived(props);

	const MINIMAL_CHROME: Required<ThemeChrome> = { graph: true, backlinks: true, dates: true, readerMode: true, explorerFilter: false, pageNav: true };
	const LIST_PAGES: Readonly<Record<string, ListPageName>> = {
		'tags-index': 'tags',
		tag: 'tag',
		feed: 'feed',
		'folders-index': 'folders',
		folder: 'folder'
	};

	const composition = $derived(compositionOf(props.theme));
	const primary = $derived(composition.primary);
	const layout = $derived(folderLayout(props.vault.entries, props.vault.folders));
	const parentOf = (folder: string) => (folder.includes('/') ? folder.slice(0, folder.lastIndexOf('/')) : undefined);
	/** The folder notes above a folder, nearest first, for `theme:` to cascade from. */
	const folderNotes = (folder: string | undefined, except?: IndexEntry) => {
		const notes: IndexEntry[] = [];
		for (let current = folder; current !== undefined; current = parentOf(current)) {
			const note = layout.noteOf(current);
			if (note && note !== except) notes.push(note);
		}
		return notes;
	};

	// One pass over the vault: every page's theme. A page two themes claim fails the build here, by name.
	const pages = $derived(
		new Map(
			props.vault.entries.flatMap((entry) => {
				const choice = choosePage(composition, entry, folderNotes(layout.folderOf(entry.slug), entry));
				return choice ? [[entry, choice] as const] : [];
			})
		)
	);
	const tree = $derived(
		buildExplorerTree(props.vault.entries, props.vault.folders, (entry) => {
			const choice = pages.get(entry);
			return choice?.renderer?.explorerItem?.(choice.data, entry);
		})
	);
	const currentHref = $derived(page.url.pathname);
	const choice = $derived(props.entry ? pages.get(props.entry) : undefined);

	let drawer = $state(false);
	let reader = $state(false);
	afterNavigate(() => (drawer = false));

	const shell: ShellState = $derived({
		...props,
		homeHref: `${props.vault.routes.mountPath}/`,
		currentHref,
		tree,
		trail: explorerTrail(tree, currentHref),
		toc: props.entry?.page.toc ? props.entry.toc : [],
		...adjacentPages(readingOrder(tree), currentHref),
		page: choice,
		pages,
		chrome: { ...MINIMAL_CHROME, ...primary.chrome },
		drawer,
		toggleDrawer: () => (drawer = !drawer),
		reader,
		toggleReader: () => (reader = !reader)
	});

	const regions = $derived({
		header: Masthead,
		navigation: Explorer,
		pageHead: PageHead,
		aside: Related,
		pageFoot: PageNav,
		footer: SiteFooter,
		...primary.regions
	} satisfies Record<RegionName, unknown>);
	const Frame = $derived(primary.frame ?? ColumnsFrame);

	/** The list page for this route: a folder note's theme's for a folder, else the primary theme's. */
	const ListPage = $derived.by(() => {
		const name = props.match ? LIST_PAGES[props.match.route.id] : undefined;
		const home = props.match?.route.id === 'home' ? primary.pages?.home : undefined;
		if (home) return home;
		if (!name) return undefined;
		const slug = props.match?.params.slug;
		const theme = name === 'folder' && slug ? folderTheme(composition, folderNotes(slug)) : primary;
		return theme.pages?.[name] ?? primary.pages?.[name];
	});
	// Notes only: list pages and 404s must not open discussions.
	const comments = $derived(props.entry?.page.comments ? themeSettings(props.themeConfig).comments : undefined);
</script>

{#snippet header()}<regions.header {shell} />{/snippet}
{#snippet navigation()}<regions.navigation {shell} />{/snippet}
{#snippet pageHead()}<regions.pageHead {shell} />{/snippet}
{#snippet pageFoot()}<regions.pageFoot {shell} />{/snippet}
{#snippet footer()}<regions.footer {shell} />{/snippet}

{#snippet intro()}
	{#if props.entry?.description}<p class="summary"><DescText value={props.entry.description} entries={props.vault.entries} /></p>{/if}
	{#if props.entry?.markdownHref}<PageActions href={props.entry.markdownHref} />{/if}
	<div class="sv-prose note-body">{@render children?.()}</div>
{/snippet}

{#snippet body()}
	{#if ListPage}
		<ListPage {...props} />
	{:else if props.entry && choice?.renderer}
		<choice.renderer.body {shell} data={choice.data} entry={props.entry}>{@render intro()}</choice.renderer.body>
	{:else if props.entry && choice?.theme.note}
		<choice.theme.note {shell} data={undefined} entry={props.entry}>{@render intro()}</choice.theme.note>
	{:else if props.entry}
		<article class="sv-prose">{@render children?.()}</article>
	{:else}
		{@render children?.()}
	{/if}
	{#if comments}<Comments {...comments} />{/if}
{/snippet}

{#snippet aside()}
	{#if props.entry && choice?.renderer?.aside}
		<choice.renderer.aside {shell} data={choice.data} entry={props.entry}>{@render intro()}</choice.renderer.aside>
	{:else}
		<regions.aside {shell} />
	{/if}
{/snippet}

<a class="sv-skip-link" href="#content">Skip to content</a>

<Frame {shell} {header} {navigation} {pageHead} {body} {aside} {pageFoot} {footer} />

<LinkPreviews />

<style>
	:global(:root) {
		--sv-density: 1;
		--sv-ratio: 1.2;
		--sv-measure: 44rem;
	}

	.summary {
		margin: 0 0 var(--sv-space-4);
		color: var(--sv-text);
		font-size: var(--sv-step-1);
	}
</style>
