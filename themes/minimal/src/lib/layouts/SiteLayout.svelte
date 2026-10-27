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
	import { tick } from 'svelte';
	import type { IndexEntry } from '@svartz/core';
	import { buildExplorerTree, Comments, DescText, folderLayout, LinkPreviews, PageActions, themeSettings, type ThemePageProps } from '@svartz/ui';
	import { compositionOf } from '../compose.js';
	import type { ListPageName, ShellState, ThemeChrome } from '../extension.js';
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

	const MINIMAL_CHROME: Required<ThemeChrome> = {
		graph: true,
		backlinks: true,
		dates: true,
		summary: false,
		readerMode: true,
		explorerFilter: false,
		pageNav: true
	};
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
	// A note's own href is the URL the tree links; prerendering can see another pathname.
	const currentHref = $derived(props.entry?.href ?? page.url.pathname);
	const choice = $derived(props.entry ? pages.get(props.entry) : undefined);

	let drawer = $state(false);
	let reader = $state(false);
	afterNavigate(() => (drawer = false));

	// Frames put the explorer in `#explorer-panel` and its menu button controls it.
	const DRAWER = '#explorer-panel';
	const MENU = `[aria-controls="explorer-panel"]`;

	/** Opening the drawer focuses its first control, the filter when there is one. */
	async function toggleDrawer() {
		drawer = !drawer;
		await tick();
		if (!drawer) return;
		// The filter first, else the first control the drawer shows; hidden ones can't take focus.
		const controls = [...document.querySelectorAll<HTMLElement>(`${DRAWER} input, ${DRAWER} a, ${DRAWER} button`)];
		const visible = controls.filter((control) => control.checkVisibility());
		(visible.find((control) => control instanceof HTMLInputElement) ?? visible[0])?.focus();
	}

	function onkeydown(event: KeyboardEvent) {
		if (event.key !== 'Escape' || !drawer) return;
		drawer = false;
		document.querySelector<HTMLElement>(MENU)?.focus();
	}

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
		toggleDrawer,
		reader,
		toggleReader: () => (reader = !reader)
	});

	// One derived per region: a dotted tag (`<regions.header>`) on a derived object skips it during SSR.
	const Header = $derived(primary.regions?.header ?? Masthead);
	const Navigation = $derived(primary.regions?.navigation ?? Explorer);
	const PageHeadRegion = $derived(primary.regions?.pageHead ?? PageHead);
	const Aside = $derived(primary.regions?.aside ?? Related);
	const PageFoot = $derived(primary.regions?.pageFoot ?? PageNav);
	const Footer = $derived(primary.regions?.footer ?? SiteFooter);
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

{#snippet header()}<Header {shell} />{/snippet}
{#snippet navigation()}<Navigation {shell} />{/snippet}
{#snippet pageHead()}<PageHeadRegion {shell} />{/snippet}
{#snippet pageFoot()}<PageFoot {shell} />{/snippet}
{#snippet footer()}<Footer {shell} />{/snippet}

{#snippet intro()}
	{#if props.entry?.description}<p class="summary"><DescText value={props.entry.description} entries={props.vault.entries} /></p>{/if}
	{#if props.entry?.markdownHref}<PageActions href={props.entry.markdownHref} />{/if}
	<div class="sv-prose note-body">{@render children?.()}</div>
{/snippet}

{#snippet body()}
	{#if ListPage}
		<ListPage {...props} />
	{:else if props.entry && choice?.renderer}
		{@const Body = choice.renderer.body}
		<Body {shell} data={choice.data} entry={props.entry}>{@render intro()}</Body>
	{:else if props.entry && choice?.theme.note}
		{@const Note = choice.theme.note}
		<Note {shell} data={undefined} entry={props.entry}>{@render intro()}</Note>
	{:else if props.entry}
		<article class="sv-prose">{@render children?.()}</article>
	{:else}
		{@render children?.()}
	{/if}
	{#if comments}<Comments {...comments} />{/if}
{/snippet}

{#snippet aside()}
	{#if props.entry && choice?.renderer?.aside}
		{@const RendererAside = choice.renderer.aside}
		<RendererAside {shell} data={choice.data} entry={props.entry}>{@render intro()}</RendererAside>
	{:else}
		<Aside {shell} />
	{/if}
{/snippet}

<svelte:window {onkeydown} />

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
