<script lang="ts">
	import { page } from '$app/state';
	import type { Component } from 'svelte';
	import { theme, resolveRuntimeRoute } from 'virtual:svartz/theme';
	import {
		assets,
		backlinks,
		folders,
		getNoteArtifact,
		graph,
		hasNoteArtifact,
		index,
		routes,
		search,
		searchDocuments,
		searchIndex,
		siteConfig,
		tags,
		themeConfig
	} from 'virtual:svartz/artifacts';

	type ComponentModule = { default: Component<any> };
	type ThemeComponentReference =
		| (() => Promise<ComponentModule>)
		| { readonly default: Component<any> };
	type RuntimeRouteMatch = ReturnType<typeof resolveRuntimeRoute>;
	let { pathname = undefined }: { pathname?: string } = $props();

	function normalizeSlug(currentPathname: string): string | undefined {
		if (currentPathname === '/') return undefined;
		return currentPathname.replace(/^\/+|\/+$/g, '');
	}

	function artifactKeyToSlug(artifactKey: string | undefined): string | undefined {
		if (!artifactKey) return undefined;
		return artifactKey.replace(/^pages\//, '').replace(/\.svelte$/, '');
	}

	function resolveComponentModule(
		reference: ThemeComponentReference | undefined
	): ComponentModule | undefined {
		if (!reference) return undefined;
		if (typeof reference === 'function') {
			throw new Error(
				'[svartz:web] lazy theme components cannot render during SSR; use an eager { default: Component } module'
			);
		}
		return reference;
	}

	function resolveLayoutReference(
		match: RuntimeRouteMatch
	): ThemeComponentReference | undefined {
		if (match?.layoutSlot && theme.layouts[match.layoutSlot]) {
			return theme.layouts[match.layoutSlot];
		}

		if (match?.artifactKey) {
			return theme.layouts.notePage;
		}

		return theme.layouts.defaultPage;
	}

	function resolvePageModule(match: RuntimeRouteMatch): ComponentModule | undefined {
		if (!match) {
			return resolveComponentModule(theme.layouts.notFoundPage);
		}

		if (match.route.component) {
			return resolveComponentModule(match.route.component);
		}

		if (match.artifactKey && hasNoteArtifact(match.artifactKey)) {
			return getNoteArtifact(match.artifactKey);
		}

		const slug = artifactKeyToSlug(match.artifactKey);
		if (slug && folders.some((folder) => folder.slug === slug)) {
			const folderRoute = theme.routes.find((route) => route.id === 'folder');
			return resolveComponentModule(folderRoute?.component);
		}

		return resolveComponentModule(theme.layouts.notFoundPage);
	}

	function resolveAbsoluteUrl(value: string | undefined): string | undefined {
		if (!value || !siteConfig.url) return undefined;
		return new URL(value, `${siteConfig.url}/`).href;
	}

	const activePathname = $derived(pathname ?? page.url.pathname);

	const runtimeRoute = $derived(
		resolveRuntimeRoute({
			pathname: activePathname,
			slug: normalizeSlug(activePathname)
		})
	);

	const entry = $derived(
		artifactKeyToSlug(runtimeRoute?.artifactKey)
			? index.entries.find(
					(candidate) => candidate.slug === artifactKeyToSlug(runtimeRoute?.artifactKey)
				)
			: undefined
	);

	const pageTitle = $derived(entry?.title ?? siteConfig.title);
	const documentTitle = $derived(
		entry && entry.title !== siteConfig.title ? `${entry.title} | ${siteConfig.title}` : siteConfig.title
	);
	const pageDescription = $derived(entry?.description ?? siteConfig.description);
	const canonicalUrl = $derived(resolveAbsoluteUrl(activePathname));
	const socialImageUrl = $derived(resolveAbsoluteUrl(siteConfig.image));

	const layoutModule = $derived(
		resolveComponentModule(resolveLayoutReference(runtimeRoute))
	);
	const pageModule = $derived(resolvePageModule(runtimeRoute));
	const LayoutComponent = $derived(layoutModule?.default);
	const PageComponent = $derived(pageModule?.default);
</script>

<svelte:head>
	<title>{documentTitle}</title>
	{#if pageDescription}<meta name="description" content={pageDescription} />{/if}
	{#if canonicalUrl}<link rel="canonical" href={canonicalUrl} />{/if}
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
	{#if entry?.publishedAt}<meta property="article:published_time" content={String(entry.publishedAt)} />{/if}
	{#if entry?.modifiedAt}<meta property="article:modified_time" content={String(entry.modifiedAt)} />{/if}
</svelte:head>

{#if LayoutComponent && PageComponent}
	<LayoutComponent
		{assets}
		{theme}
		{themeConfig}
		route={runtimeRoute?.route}
		match={runtimeRoute}
		{entry}
		{index}
		{graph}
		{backlinks}
		{folders}
		{routes}
		{search}
		{searchDocuments}
		{searchIndex}
		{tags}
	>
		<PageComponent
			{assets}
			{themeConfig}
			route={runtimeRoute?.route}
			match={runtimeRoute}
			{entry}
			{index}
			{graph}
			{backlinks}
			{folders}
			{routes}
			{search}
			{searchDocuments}
			{searchIndex}
			{tags}
		/>
	</LayoutComponent>
{:else}
	<p>Route component unavailable.</p>
{/if}
