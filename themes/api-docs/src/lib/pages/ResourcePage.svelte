<!-- One resource (top-level folder): its models, operations, and guides. -->
<script lang="ts">
	import { count, folderContents, type ThemePageProps } from '@svartz/ui';
	import EndpointList from '../components/EndpointList.svelte';
	import PageTitle from '../components/PageTitle.svelte';
	import { apiNav, readOperation } from '../api.js';

	let { vault, match }: ThemePageProps = $props();

	const slug = $derived(match?.params.slug ?? '');
	const section = $derived(apiNav(vault.entries, vault.folders).find((candidate) => candidate.slug === slug));
	// Nested folders aren't sections; list their notes as they are.
	const entries = $derived(section?.entries ?? folderContents(slug, vault.entries, vault.folders).notes);
	const title = $derived(section?.title ?? vault.folders.find((folder) => folder.slug === slug)?.title ?? slug);
	const operations = $derived(entries.filter((entry) => readOperation(entry.properties)).length);
</script>

<PageTitle {title} summary={operations ? `${count(operations, 'operation')}.` : undefined} />
<EndpointList {entries} />
