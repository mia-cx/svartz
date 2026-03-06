<script lang="ts">
	import { page } from '$app/state';
	import type { Component } from 'svelte';
	import { theme, resolveRuntimeRoute } from 'virtual:svartz/theme';
	import {
		backlinks,
		graph,
		index,
		loadNoteArtifact,
		search
	} from 'virtual:svartz/artifacts';

	type ComponentModule = { default: Component<any> };
	type ThemeComponentLoader =
		| (() => Promise<ComponentModule>)
		| { readonly default: Component<any> };
	type RuntimeRouteMatch = ReturnType<typeof resolveRuntimeRoute>;

	function normalizeSlug(pathname: string): string | undefined {
		if (pathname === '/') return undefined;
		return pathname.replace(/^\/+|\/+$/g, '');
	}

	function artifactKeyToSlug(artifactKey: string | undefined): string | undefined {
		if (!artifactKey) return undefined;
		return artifactKey.replace(/^pages\//, '').replace(/\.svelte$/, '');
	}

	function resolveComponentModule(
		loader: ThemeComponentLoader | undefined
	): Promise<ComponentModule | undefined> {
		if (!loader) return Promise.resolve(undefined);
		if (typeof loader === 'function') {
			return loader() as Promise<ComponentModule>;
		}
		return Promise.resolve(loader as ComponentModule);
	}

	function resolveLayoutLoader(match: RuntimeRouteMatch): ThemeComponentLoader | undefined {
		if (match?.layoutSlot && theme.layouts[match.layoutSlot]) {
			return theme.layouts[match.layoutSlot];
		}

		if (match?.artifactKey) {
			return theme.layouts.notePage;
		}

		return theme.layouts.defaultPage;
	}

	function resolvePageModule(match: RuntimeRouteMatch): Promise<ComponentModule | undefined> {
		if (!match) {
			return resolveComponentModule(theme.layouts.notFoundPage);
		}

		if (match.route.component) {
			return resolveComponentModule(match.route.component);
		}

		if (match.artifactKey) {
			return loadNoteArtifact(match.artifactKey) as Promise<ComponentModule>;
		}

		return Promise.resolve(undefined);
	}

	const runtimeRoute = $derived(
		resolveRuntimeRoute({
			pathname: page.url.pathname,
			slug: normalizeSlug(page.url.pathname)
		})
	);

	const entry = $derived(
		artifactKeyToSlug(runtimeRoute?.artifactKey)
			? index.entries.find(
					(candidate) => candidate.slug === artifactKeyToSlug(runtimeRoute?.artifactKey)
				)
			: undefined
	);

	const renderState = $derived.by(async () => {
		const [layout, pageModule] = await Promise.all([
			resolveComponentModule(resolveLayoutLoader(runtimeRoute)),
			resolvePageModule(runtimeRoute)
		]);

		return { layout, pageModule };
	});
</script>

{#await renderState}
	<div aria-live="polite">Loading...</div>
{:then rendered}
	{@const LayoutComponent = rendered.layout?.default}
	{@const PageComponent = rendered.pageModule?.default}

	{#if LayoutComponent && PageComponent}
		<LayoutComponent
			{theme}
			route={runtimeRoute?.route}
			match={runtimeRoute}
			{entry}
			{index}
			{graph}
			{backlinks}
			{search}
		>
			<PageComponent
				route={runtimeRoute?.route}
				match={runtimeRoute}
				{entry}
				{index}
				{graph}
				{backlinks}
				{search}
			/>
		</LayoutComponent>
	{:else}
		<p>Route component unavailable.</p>
	{/if}
{:catch error}
	<p>{error instanceof Error ? error.message : 'Failed to load page.'}</p>
{/await}
