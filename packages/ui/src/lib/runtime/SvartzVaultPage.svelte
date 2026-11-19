<script lang="ts">
	import type { Component } from 'svelte';
	import PageBody from './PageBody.svelte';
	import { themeTokenCss } from '../theme-tokens.js';
	import {
		artifactKeyToSlug,
		useBrowserResources,
		VaultPageState,
		type PageModule
	} from './vault-page-state.svelte.js';
	import type { ContentComponentOverrides } from './content-components.js';
	import type { PluginPage } from '@svartz/core';
	type ThemeModule = typeof import('virtual:svartz/theme');
	type ArtifactsModule = typeof import('virtual:svartz/artifacts');

	// A theme page takes base.css's element defaults back from a host page (VaultNoteContent).
	$effect(() => {
		delete document.documentElement.dataset.svartzHostPage;
	});
	let {
		pathname,
		runtimeTheme,
		artifacts: runtimeArtifacts,
		contentComponents: hostContentComponents = {},
		pluginPage
	}: {
		pathname: string;
		runtimeTheme: ThemeModule;
		artifacts: ArtifactsModule;
		contentComponents?: ContentComponentOverrides;
		/** A plugin page's title and HTML, rendered as the body of the theme's default layout. */
		pluginPage?: PluginPage;
	} = $props();

	const siteConfig = $derived(runtimeArtifacts.siteConfig);
	const deploymentBasePath = $derived(runtimeArtifacts.deploymentBasePath);
	const activePathname = $derived(pathname);
	const appPathname = $derived(
		deploymentBasePath && activePathname.startsWith(`${deploymentBasePath}/`)
			? activePathname.slice(deploymentBasePath.length)
			: activePathname === deploymentBasePath
				? '/'
				: activePathname
	);

	const state = new VaultPageState(() => ({
		appPathname,
		runtimeTheme,
		artifacts: runtimeArtifacts,
		contentComponents: hostContentComponents,
		pluginPage: Boolean(pluginPage)
	}));
	useBrowserResources(() => ({
		artifacts: runtimeArtifacts,
		pathname,
		noteHref: state.entry?.href,
		contentComponents: state.contentComponents
	}));

	const theme = $derived(state.theme);
	const index = $derived(state.index);
	const entry = $derived(state.entry);
	const runtimeRoute = $derived(state.runtimeRoute);
	// The vault's `theme.tokens`, above the theme's own tokens and the Svartz defaults.
	const tokenCss = $derived(themeTokenCss(runtimeArtifacts.themeConfig?.tokens));

	type ThemeComponentReference =
		| (() => Promise<PageModule>)
		| { readonly default: Component<any> };
	type RuntimeRouteMatch = ReturnType<ThemeModule['resolveRuntimeRoute']>;

	function resolveComponentModule(
		reference: ThemeComponentReference | undefined
	): PageModule | undefined {
		if (!reference) return undefined;
		if (typeof reference === 'function') {
			throw new Error(
				'[svartz:web] lazy theme components cannot render during SSR; use an eager { default: Component } module'
			);
		}
		return reference;
	}

	function resolveLayoutReference(match: RuntimeRouteMatch): ThemeComponentReference | undefined {
		if (match?.layoutSlot && theme.layouts[match.layoutSlot]) {
			return theme.layouts[match.layoutSlot];
		}

		if (match?.artifactKey) {
			return theme.layouts.notePage;
		}

		return theme.layouts.defaultPage;
	}

	function resolvePageModule(match: RuntimeRouteMatch): PageModule | undefined {
		if (!match) {
			return resolveComponentModule(theme.layouts.notFoundPage);
		}

		if (match.route.component) {
			return resolveComponentModule(match.route.component);
		}

		if (state.noteModule) {
			return state.noteModule;
		}

		const slug = artifactKeyToSlug(match.artifactKey);
		if (slug && state.themeProps.folders.some((folder) => folder.slug === slug)) {
			const folderRoute = theme.routes.find((route) => route.id === 'folder');
			return resolveComponentModule(folderRoute?.component);
		}

		return resolveComponentModule(theme.layouts.notFoundPage);
	}

	function resolveSiteAssetUrl(value: string | undefined): string | undefined {
		if (!value || !siteConfig.url) return undefined;
		if (/^https?:\/\//i.test(value)) return value;
		return new URL(value.replace(/^\/+/, ''), `${siteConfig.url.replace(/\/+$/, '')}/`).href;
	}

	function isoDate(value: Date | string | undefined): string | undefined {
		if (!value) return undefined;
		const date = value instanceof Date ? value : new Date(value);
		return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
	}

	function resolvePublishedUrl(value: string | undefined): string | undefined {
		if (!value || !siteConfig.url) return undefined;
		if (/^https?:\/\//i.test(value)) return value;
		const origin = new URL(siteConfig.url).origin;
		return new URL(value, new URL(activePathname, origin)).href;
	}

	const pageTitle = $derived(entry?.title ?? pluginPage?.title ?? siteConfig.title);
	const documentTitle = $derived(
		pageTitle !== siteConfig.title ? `${pageTitle} | ${siteConfig.title}` : siteConfig.title
	);
	const pageDescription = $derived(entry?.description ?? siteConfig.description);
	// A plugin page differs per reader, so it has no canonical address and stays out of search results.
	const canonicalUrl = $derived(pluginPage ? undefined : resolvePublishedUrl(activePathname));
	const socialImageUrl = $derived(
		entry?.socialImage && entry.socialImage !== siteConfig.image
			? resolvePublishedUrl(entry.socialImage)
			: resolveSiteAssetUrl(siteConfig.image)
	);

	const layoutModule = $derived(resolveComponentModule(resolveLayoutReference(runtimeRoute)));
	const pageModule = $derived(resolvePageModule(runtimeRoute));
	const LayoutComponent = $derived(layoutModule?.default);
</script>

<svelte:head>
	<title>{documentTitle}</title>
	{#if tokenCss}{@html `<style data-svartz-tokens>${tokenCss}</style>`}{/if}
	{#if index.favicon}
		<link
			rel="icon"
			href={siteConfig.url
				? resolveSiteAssetUrl(index.favicon.svg ?? index.favicon.png)
				: index.favicon.inline}
			type={siteConfig.url && index.favicon.svg ? 'image/svg+xml' : 'image/png'}
		/>
		{#if siteConfig.url}<link
				rel="apple-touch-icon"
				href={resolveSiteAssetUrl(index.favicon.appleTouch)}
			/>{/if}
	{/if}
	{#if pageDescription}<meta name="description" content={pageDescription} />{/if}
	{#if pluginPage}<meta name="robots" content="noindex" />{/if}
	{#if canonicalUrl}<link rel="canonical" href={canonicalUrl} />{/if}
	{#if entry?.markdownHref}<link rel="alternate" type="text/markdown" href={entry.markdownHref} />{/if}
	<meta property="og:title" content={pageTitle} />
	{#if pageDescription}<meta property="og:description" content={pageDescription} />{/if}
	<meta property="og:type" content={entry ? 'article' : 'website'} />
	{#if canonicalUrl}<meta property="og:url" content={canonicalUrl} />{/if}
	{#if socialImageUrl}<meta property="og:image" content={socialImageUrl} />{/if}
	<meta name="twitter:card" content={socialImageUrl ? 'summary_large_image' : 'summary'} />
	<meta name="twitter:title" content={pageTitle} />
	{#if pageDescription}<meta name="twitter:description" content={pageDescription} />{/if}
	{#if socialImageUrl}<meta name="twitter:image" content={socialImageUrl} />{/if}
	{#if siteConfig.author}<meta name="author" content={siteConfig.author} />{/if}
	{#if isoDate(entry?.publishedAt)}<meta
			property="article:published_time"
			content={isoDate(entry?.publishedAt)}
		/>{/if}
	{#if isoDate(entry?.modifiedAt)}<meta
			property="article:modified_time"
			content={isoDate(entry?.modifiedAt)}
		/>{/if}
</svelte:head>

{#if LayoutComponent && pluginPage}
	<!-- A plugin page shows the reader's own account data; Clarity must never record it. -->
	<div data-clarity-mask="true" style="display: contents">
		<LayoutComponent {...state.themeProps} {theme}>
			{@html pluginPage.html}
		</LayoutComponent>
	</div>
{:else if LayoutComponent && pageModule}
	<!-- Clarity must never record a note body, including content decrypted after hydration. -->
	<div data-clarity-mask="true" style="display: contents">
		<LayoutComponent {...state.themeProps} {theme}>
			<PageBody {state} module={pageModule} />
		</LayoutComponent>
	</div>
{:else}
	<p>Route component unavailable.</p>
{/if}
