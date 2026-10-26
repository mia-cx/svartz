<script lang="ts">
	import { count, notesTagged } from '../../listing.js';
	import type { ThemePageProps } from '../../runtime/theme-props.js';
	import EntryList from './EntryList.svelte';
	import PageTitle from './PageTitle.svelte';

	let { vault, match }: ThemePageProps = $props();

	const slug = $derived(match?.params.slug ?? '');
	const tag = $derived(vault.tags.find((candidate) => candidate.slug === slug));
	const entries = $derived(notesTagged(vault.entries, slug));
</script>

<PageTitle title="#{tag?.title ?? slug}" summary="{count(entries.length, 'page')} tagged." />
<EntryList {entries} />
