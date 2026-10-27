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
	import {
		buildExplorerTree,
		Comments,
		DescText,
		folderLayout,
		LinkPreviews,
		PageActions,
		readSources,
		SourceLinks,
		themeSettings,
		type ThemePageProps
	} from '@svartz/ui';
	import { compositionOf } from '../compose.js';
	import type { ListPageName, ShellState, ThemeChrome } from '../extension.js';
	import { choosePage, folderTheme } from '../select.js';
	import { adjacentPages, explorerTrail, physicalFolder, readingOrder } from '../shell.js';
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
	// An unlocked hidden note is the current entry without being in the vault's discovery list, so it picks its theme here.
	const choice = $derived.by(() => {
		const entry = props.entry;
		if (!entry) return undefined;
		if (props.vault.entries.includes(entry)) return pages.get(entry);
		// The folder records leave hidden notes out, so the note's file decides which folder notes cascade.
		const folder = layout.folderOf(entry.slug) ?? physicalFolder(entry, props.vault.entries, layout.folderOf);
		return choosePage(composition, entry, folderNotes(folder, entry));
	});

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
		headed: Boolean(props.entry && (choice?.renderer || (choice?.theme ?? primary).note)),
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

	/**
	 * The list page for this route: a folder note's theme's for a folder, else
	 * the primary theme's. The runtime serves `/` and a folder's own URL
	 * (`/posts/`) through the note route, as the home note or as the folder's
	 * page in `children`, so those are recognised by what they show.
	 */
	const ListPage = $derived.by(() => {
		const route = props.match?.route.id;
		if (route === 'home' || props.entry?.slug === 'index') return primary.pages?.home;
		const slug = props.match?.params.slug;
		const folder =
			route === 'folder' ? slug : route === 'note' && !props.entry && props.vault.folders.some((item) => item.slug === slug) ? slug : undefined;
		if (folder) return folderTheme(composition, folderNotes(folder)).pages?.folder ?? primary.pages?.folder;
		const name = route ? LIST_PAGES[route] : undefined;
		return name ? primary.pages?.[name] : undefined;
	});
	/** Plain notes render with their theme's `note`, the primary theme's when no `theme:` names another. */
	const Note = $derived(props.entry && !choice?.renderer ? (choice?.theme ?? primary).note : undefined);
	/** "Defined in" links from a note's `source` frontmatter, after its body in every theme. */
	const sources = $derived(props.entry ? readSources(props.entry.properties) : []);
	// Notes only: list pages and 404s must not open discussions.
	const comments = $derived(props.entry?.page.comments ? themeSettings(props.themeConfig).comments : undefined);
</script>

{#snippet header()}<Header {shell} />{/snippet}
{#snippet navigation()}<Navigation {shell} />{/snippet}
{#snippet pageHead()}<PageHeadRegion {shell} />{/snippet}
{#snippet pageFoot()}<PageFoot {shell} />{/snippet}
{#snippet footer()}<Footer {shell} />{/snippet}

{#snippet summary()}
	{#if props.entry?.description}<p class="summary"><DescText value={props.entry.description} entries={props.vault.entries} /></p>{/if}
{/snippet}
{#snippet actions()}
	{#if props.entry?.markdownHref}<PageActions href={props.entry.markdownHref} />{/if}
{/snippet}
{#snippet sourceLinks()}
	{#if sources.length > 0}<SourceLinks {sources} />{/if}
{/snippet}
{#snippet content()}
	<div class="sv-prose note-body">{@render children?.()}</div>
	{@render sourceLinks()}
{/snippet}
{#snippet intro()}
	{@render summary()}{@render actions()}{@render content()}
{/snippet}
{#snippet claimed()}
	{#if props.entry && choice?.renderer}
		{@const Body = choice.renderer.body}
		<Body {shell} data={choice.data} entry={props.entry} {summary} {actions} {content}>{@render intro()}</Body>
	{/if}
{/snippet}

{#snippet body()}
	{#if ListPage}
		<!-- A home note a renderer claims reaches the home page rendered, infobox or symbol included. -->
		<ListPage {...props} children={props.entry && choice?.renderer ? claimed : children} />
	{:else if props.entry && choice?.renderer}
		{@render claimed()}
	{:else if props.entry && Note}
		<Note {shell} data={undefined} entry={props.entry} {summary} {actions} {content}>{@render intro()}</Note>
	{:else if props.entry}
		<article class="sv-prose">{@render children?.()}</article>
		{@render sourceLinks()}
	{:else}
		{@render children?.()}
	{/if}
	{#if comments}<Comments {...comments} />{/if}
{/snippet}

{#snippet aside()}
	{#if props.entry && choice?.renderer?.aside}
		{@const RendererAside = choice.renderer.aside}
		<RendererAside {shell} data={choice.data} entry={props.entry} {summary} {actions} {content}>{@render intro()}</RendererAside>
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
