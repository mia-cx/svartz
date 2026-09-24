<script lang="ts">
	import type { Component } from 'svelte';
	import { base } from '$app/paths';
	import { browser } from '$app/environment';
	import ProtectedNote from './ProtectedNote.svelte';
	import type { ProtectedNoteReference } from './protected-client.js';
	import {
		resolveContentComponents,
		type ContentComponentOverrides
	} from './content-components.js';
	type ThemeModule = typeof import('virtual:svartz/theme');
	type ArtifactsModule = typeof import('virtual:svartz/artifacts');
	let {
		pathname,
		runtimeTheme,
		artifacts: runtimeArtifacts,
		contentComponents: hostContentComponents = {}
	}: {
		pathname: string;
		runtimeTheme: ThemeModule;
		artifacts: ArtifactsModule;
		contentComponents?: ContentComponentOverrides;
	} = $props();
	const theme = $derived(runtimeTheme.theme);
	const contentComponents = $derived(
		resolveContentComponents(
			hostContentComponents,
			theme.components as Parameters<typeof resolveContentComponents>[1]
		)
	);
	const resolveRuntimeRoute = $derived(runtimeTheme.resolveRuntimeRoute);
	const assets = $derived(runtimeArtifacts.assets);
	const backlinks = $derived(runtimeArtifacts.backlinks);
	const folders = $derived(runtimeArtifacts.folders);
	const getNoteArtifact = $derived(runtimeArtifacts.getNoteArtifact);
	const graph = $derived(runtimeArtifacts.graph);
	const hasNoteArtifact = $derived(runtimeArtifacts.hasNoteArtifact);
	const index = $derived(runtimeArtifacts.index);
	const routes = $derived(runtimeArtifacts.routes);
	const search = $derived(runtimeArtifacts.search);
	const searchDocuments = $derived(runtimeArtifacts.searchDocuments);
	const searchIndex = $derived(runtimeArtifacts.searchIndex);
	const searchOptions = $derived(runtimeArtifacts.searchOptions);
	const siteConfig = $derived(runtimeArtifacts.siteConfig);
	const tags = $derived(runtimeArtifacts.tags);
	const themeConfig = $derived(runtimeArtifacts.themeConfig);
	const vault = $derived(runtimeArtifacts.vault);
	$effect(() => {
		if (!browser) return;
		let released = false;
		let dispose: (() => void) | undefined;
		void runtimeArtifacts
			.mountBrowserResources(pathname)
			.then((cleanup) => {
				if (released) cleanup();
				else dispose = cleanup;
			})
			.catch((error: unknown) =>
				console.error('[svartz:web] browser resource mount failed', error)
			);
		return () => {
			released = true;
			dispose?.();
		};
	});

	type ComponentModule = { default: Component<any>; svartzProtected?: ProtectedNoteReference };
	type ThemeComponentReference =
		| (() => Promise<ComponentModule>)
		| { readonly default: Component<any> };
	type RuntimeRouteMatch = ReturnType<typeof resolveRuntimeRoute>;

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

	function resolveLayoutReference(match: RuntimeRouteMatch): ThemeComponentReference | undefined {
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
		if (/^https?:\/\//i.test(value)) return value;
		return new URL(value.replace(/^\/+/, ''), `${siteConfig.url.replace(/\/+$/, '')}/`).href;
	}

	const activePathname = $derived(pathname);
	const appPathname = $derived(
		base && activePathname.startsWith(`${base}/`)
			? activePathname.slice(base.length)
			: activePathname === base
				? '/'
				: activePathname
	);
	const vaultPathname = $derived(
		routes.mountPath && appPathname.startsWith(`${routes.mountPath}/`)
			? appPathname.slice(routes.mountPath.length)
			: appPathname === routes.mountPath
				? '/'
				: appPathname
	);
	const canonicalEntry = $derived(
		index.entries.find(
			(candidate) =>
				candidate.href === (appPathname.endsWith('/') ? appPathname : `${appPathname}/`)
		)
	);

	const runtimeRoute = $derived.by(() => {
		const match = resolveRuntimeRoute({
			pathname: vaultPathname,
			slug: normalizeSlug(vaultPathname)
		});
		if (!canonicalEntry || match?.route.id === 'note') return match;
		const noteRoute = theme.routes.find((route) => route.id === 'note');
		return noteRoute
			? {
					route: noteRoute,
					pathname: vaultPathname,
					params: { slug: canonicalEntry.slug },
					layoutSlot: noteRoute.layoutSlot,
					artifactKey: `pages/${canonicalEntry.slug}.svelte`
				}
			: match;
	});

	const entry = $derived(
		artifactKeyToSlug(runtimeRoute?.artifactKey)
			? vault.entries.find(
					(candidate) => candidate.slug === artifactKeyToSlug(runtimeRoute?.artifactKey)
				)
			: undefined
	);

	const pageTitle = $derived(entry?.title ?? siteConfig.title);
	const documentTitle = $derived(
		entry && entry.title !== siteConfig.title
			? `${entry.title} | ${siteConfig.title}`
			: siteConfig.title
	);
	const pageDescription = $derived(entry?.description ?? siteConfig.description);
	const canonicalUrl = $derived(resolveAbsoluteUrl(activePathname));
	const socialImageUrl = $derived(resolveAbsoluteUrl(entry?.socialImage ?? siteConfig.image));

	const layoutModule = $derived(resolveComponentModule(resolveLayoutReference(runtimeRoute)));
	const pageModule = $derived(resolvePageModule(runtimeRoute));
	const LayoutComponent = $derived(layoutModule?.default);
	const PageComponent = $derived(pageModule?.default);
	const protection = $derived(pageModule?.svartzProtected);
</script>

<svelte:head>
	<title>{documentTitle}</title>
	{#if index.favicon}
		<link
			rel="icon"
			href={siteConfig.url
				? resolveAbsoluteUrl(index.favicon.svg ?? index.favicon.png)
				: index.favicon.inline}
			type={siteConfig.url && index.favicon.svg ? 'image/svg+xml' : 'image/png'}
		/>
		{#if siteConfig.url}<link
				rel="apple-touch-icon"
				href={resolveAbsoluteUrl(index.favicon.appleTouch)}
			/>{/if}
	{/if}
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
	{#if entry?.publishedAt}<meta
			property="article:published_time"
			content={String(entry.publishedAt)}
		/>{/if}
	{#if entry?.modifiedAt}<meta
			property="article:modified_time"
			content={String(entry.modifiedAt)}
		/>{/if}
</svelte:head>

{#if LayoutComponent && PageComponent}
	<!-- Clarity must never record a note body, including content decrypted after hydration. -->
	<div data-clarity-mask="true" style="display: contents">
		<LayoutComponent
			{assets}
			{theme}
			{themeConfig}
			route={runtimeRoute?.route}
			match={runtimeRoute}
			{entry}
			{index}
			{vault}
			{graph}
			{backlinks}
			{folders}
			{routes}
			{search}
			{searchDocuments}
			{searchIndex}
			{searchOptions}
			{tags}
		>
			{#if protection}
			{#key `${protection.payloadId}:${protection.slug}`}
			<ProtectedNote
				{protection}
				loadBridgeUrls={runtimeArtifacts.loadProtectedBridgeUrls}
				{contentComponents}
				{assets}
				{themeConfig}
				route={runtimeRoute?.route}
				match={runtimeRoute}
				{entry}
				{index}
				{vault}
				{graph}
				{backlinks}
				{folders}
				{routes}
				{search}
				{searchDocuments}
				{searchIndex}
				{searchOptions}
				{tags}
			/>
			{/key}
			{:else}<PageComponent
				{contentComponents}
				{assets}
				{themeConfig}
				route={runtimeRoute?.route}
				match={runtimeRoute}
				{entry}
				{index}
				{vault}
				{graph}
				{backlinks}
				{folders}
				{routes}
				{search}
				{searchDocuments}
				{searchIndex}
				{searchOptions}
				{tags}
			/>{/if}
		</LayoutComponent>
	</div>
{:else}
	<p>Route component unavailable.</p>
{/if}
