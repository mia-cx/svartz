import type { IndexEntry, SvartzPlugin, ThemeRenderCapabilities, TocEntry, VaultView } from '@svartz/core';
import type { ExplorerItem, ExplorerNode, ThemePageProps, ThemeTokens } from '@svartz/ui';
import type { Component, Snippet } from 'svelte';

type Properties = Readonly<Record<string, unknown>>;

export type { BadgeHue, ExplorerItem } from '@svartz/ui';

/** A stop in reading order: a folder's page, or a note. */
export interface ReadingStop {
	readonly title: string;
	readonly href: string;
}

/**
 * The theme that renders a page, and the renderer and data when one of its
 * renderers claimed the page. Plain notes in the primary theme have no choice.
 */
export interface PageChoice {
	readonly theme: ThemeExtension;
	readonly renderer?: PageRenderer;
	readonly data?: unknown;
}

/**
 * Everything minimal works out once per page and hands to every region, so a
 * theme that swaps a region keeps minimal's behaviour.
 */
export interface ShellState extends ThemePageProps {
	readonly vault: VaultView;
	readonly homeHref: string;
	readonly currentHref: string;
	/** The explorer tree, with renderer rows and `order` applied. */
	readonly tree: readonly ExplorerNode<IndexEntry>[];
	/** Explorer folder ids above the current page, outermost first. */
	readonly trail: readonly string[];
	readonly toc: readonly TocEntry[];
	readonly previous?: ReadingStop;
	readonly next?: ReadingStop;
	/** The theme and renderer this page renders with, when it isn't a plain note. */
	readonly page?: PageChoice;
	/** Every page's choice in the vault, for renderers that link across pages (schemas). */
	readonly pages: ReadonlyMap<IndexEntry, PageChoice>;
	readonly chrome: Required<ThemeChrome>;
	/** Whether the phone drawer is open. */
	readonly drawer: boolean;
	readonly toggleDrawer: () => void;
}

export interface RegionProps {
	readonly shell: ShellState;
}

/** A frame lays out the regions; minimal's is three columns. */
export interface FrameProps extends RegionProps {
	readonly header: Snippet;
	readonly navigation: Snippet;
	/** Breadcrumbs, title, meta, tags, and page actions; empty for renderer pages, which head themselves. */
	readonly pageHead: Snippet;
	readonly body: Snippet;
	readonly aside: Snippet;
	readonly pageFoot: Snippet;
	readonly footer: Snippet;
}

export interface RendererProps<T> extends RegionProps {
	readonly data: T;
	readonly entry: IndexEntry;
	/** The page's description, page actions, and Markdown body, for the renderer to place under its own header. */
	readonly children: Snippet;
}

/**
 * Renders one kind of page, chosen from the page's frontmatter: an endpoint
 * from `operation`, a symbol from `symbol`, a wiki article from `infobox`.
 *
 * ```ts
 * const webhooks = definePageRenderer({
 *   id: 'webhook',
 *   detect: (properties) => isRecord(properties.webhook) ? readWebhook(properties.webhook) : undefined,
 *   explorerItem: (hook) => ({ badge: { label: 'HOOK', hue: 'orange' }, label: hook.event }),
 *   body: WebhookPage,
 *   aside: WebhookExamples
 * });
 * ```
 */
export interface PageRenderer<T = unknown> {
	readonly id: string;
	/** The page's data when this renderer renders it, else `undefined`. Throw with a reason when its metadata is invalid. */
	readonly detect: (properties: Properties, entry: IndexEntry) => T | undefined;
	/** The page's main column: its own header, then `children`. */
	readonly body: Component<RendererProps<T>>;
	/** Replaces the right column; without one, the page gets the theme's right column. */
	readonly aside?: Component<RendererProps<T>>;
	readonly explorerItem?: (data: T, entry: IndexEntry) => ExplorerItem;
}

/** Keeps a renderer's data type flowing from `detect` to its components. */
export const definePageRenderer = <T>(renderer: PageRenderer<T>): PageRenderer => renderer as PageRenderer;

/** Minimal's optional furniture. */
export interface ThemeChrome {
	readonly graph?: boolean;
	readonly backlinks?: boolean;
	/** Dates and reading time under the title. */
	readonly dates?: boolean;
	readonly readerMode?: boolean;
	/** A filter above the explorer. */
	readonly explorerFilter?: boolean;
	/** Previous and next links below each page. */
	readonly pageNav?: boolean;
}

export type RegionName = 'header' | 'navigation' | 'pageHead' | 'aside' | 'pageFoot' | 'footer';

/** The list pages a theme can provide; each receives the usual page props. */
export type ListPageName = 'home' | 'tags' | 'tag' | 'folders' | 'folder' | 'feed' | 'notFound';

/**
 * What a theme adds to theme-minimal. Everything is optional: minimal itself is
 * the empty extension. In a composition the first extension's frame, regions,
 * list pages, chrome, and tokens style the site; every extension's renderers
 * render pages.
 */
export interface ThemeExtension {
	/** The package name, which `theme:` frontmatter can name. */
	readonly id: string;
	/** A short name `theme:` frontmatter can use: `wiki`, `api-docs`. */
	readonly name?: string;
	readonly displayName?: string;
	readonly description?: string;
	readonly version?: string;
	readonly frame?: Component<FrameProps>;
	readonly regions?: Partial<Record<RegionName, Component<RegionProps>>>;
	readonly renderers?: readonly PageRenderer[];
	/** Renders a plain note the theme's way when `theme:` names this theme and no renderer claims the page. */
	readonly note?: Component<RendererProps<undefined>>;
	readonly pages?: Partial<Record<ListPageName, Component<ThemePageProps>>>;
	readonly chrome?: ThemeChrome;
	readonly tokens?: ThemeTokens;
	/** Content components (`callout`, `codeBlock`, …) this theme overrides. */
	readonly components?: Readonly<Record<string, Component>>;
}

/** The Node-safe part of an extension, for the build: no components. */
export interface ThemeBuildExtension {
	readonly id: string;
	readonly name?: string;
	readonly displayName?: string;
	readonly description?: string;
	readonly version?: string;
	readonly plugins?: readonly SvartzPlugin[];
	readonly capabilities?: ThemeRenderCapabilities;
}
