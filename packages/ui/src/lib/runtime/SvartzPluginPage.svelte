<!--
	A plugin page under `/-/`, such as `/-/account/`: the plugin's HTML as the body of the theme's default layout, so it
	keeps the site's header, explorer and search. The route that renders plugin pages passes what its `load` got from
	`svartzPage`. Kept apart from `SvartzVaultPage` so note pages render exactly as they did.
-->
<script lang="ts">
	import { decodeRoutePath, type PluginPage } from '@svartz/core';
	import { resolveHostVault, vaults } from 'virtual:svartz/host';
	import type { Component } from 'svelte';
	import { themeTokenCss } from '../theme-tokens.js';
	import { useBrowserResources, VaultPageState } from './vault-page-state.svelte.js';

	type ThemeModule = typeof import('virtual:svartz/theme');
	type ArtifactsModule = typeof import('virtual:svartz/artifacts');

	let { pathname, page }: { pathname: string; page: PluginPage } = $props();

	const base = vaults[0]?.basePath ?? '';
	const appPathname = $derived(
		base && pathname.startsWith(`${base}/`) ? pathname.slice(base.length) : pathname === base ? '/' : pathname
	);
	const selected = $derived(resolveHostVault(decodeRoutePath(appPathname) ?? ''));
	// Prepared by the route's load, which 404s first when no vault is mounted here.
	const runtimeTheme = $derived(selected?.theme as ThemeModule);
	const artifacts = $derived(selected?.artifacts as ArtifactsModule);

	// A theme page takes base.css's element defaults back from a host page (VaultNoteContent), as SvartzVaultPage does.
	$effect(() => {
		delete document.documentElement.dataset.svartzHostPage;
	});

	const state = new VaultPageState(() => ({ appPathname, runtimeTheme, artifacts, contentComponents: {}, pluginPage: true }));
	useBrowserResources(() => ({ artifacts, pathname, contentComponents: state.contentComponents }));

	const site = $derived(artifacts.siteConfig);
	const tokenCss = $derived(themeTokenCss(artifacts.themeConfig?.tokens));
	const favicon = $derived(state.index.favicon);
	const asset = (value: string | undefined) =>
		value && site.url ? new URL(value.replace(/^\/+/, ''), `${site.url.replace(/\/+$/, '')}/`).href : undefined;
	const layout = $derived(state.theme.layouts.defaultPage);
	const Layout = $derived(layout && typeof layout !== 'function' ? (layout.default as Component<any>) : undefined);
</script>

<svelte:head>
	<title>{page.title === site.title ? site.title : `${page.title} | ${site.title}`}</title>
	<!-- It differs per reader: keep it out of search results. -->
	<meta name="robots" content="noindex" />
	{#if tokenCss}{@html `<style data-svartz-tokens>${tokenCss}</style>`}{/if}
	{#if favicon}
		<link
			rel="icon"
			href={site.url ? asset(favicon.svg ?? favicon.png) : favicon.inline}
			type={site.url && favicon.svg ? 'image/svg+xml' : 'image/png'}
		/>
	{/if}
</svelte:head>

{#if Layout}
	<!-- A plugin page can show the reader's own account; Clarity must never record it. -->
	<div data-clarity-mask="true" style="display: contents">
		<Layout {...state.themeProps} theme={state.theme}>
			{@html page.html}
		</Layout>
	</div>
{/if}
