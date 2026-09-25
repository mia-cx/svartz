<script lang="ts">
	import { count, notesTagged, type ThemePageProps } from '@svartz/ui';
	import EndpointList from '../components/EndpointList.svelte';
	import PageTitle from '../components/PageTitle.svelte';

	let { vault, match }: ThemePageProps = $props();

	const slug = $derived(match?.params.slug ?? '');
	const tag = $derived(vault.tags.find((candidate) => candidate.slug === slug));
	const entries = $derived(notesTagged(vault.entries, slug));
</script>

<PageTitle title="#{tag?.title ?? slug}" summary="{count(entries.length, 'page')} tagged." />
<EndpointList {entries} />
