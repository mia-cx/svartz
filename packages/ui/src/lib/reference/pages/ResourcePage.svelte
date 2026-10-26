<!-- One section (top-level folder) or nested folder: its pages in sidebar order. -->
<script lang="ts">
	import { count, folderContents } from '../../listing.js';
	import type { ThemePageProps } from '../../runtime/theme-props.js';
	import EntryList from './EntryList.svelte';
	import PageTitle from './PageTitle.svelte';
	import { getReferenceShell } from '../context.js';
	import { navLinks } from '../nav.js';

	let { vault, match }: ThemePageProps = $props();

	const shell = getReferenceShell();
	const slug = $derived(match?.params.slug ?? '');
	const section = $derived(shell.sections.find((candidate) => candidate.slug === slug));
	// Nested folders aren't sections; list their pages as they are.
	const entries = $derived(
		section ? navLinks([section]).map((link) => link.entry) : folderContents(slug, vault.entries, vault.folders).notes
	);
	const title = $derived(section?.title ?? vault.folders.find((folder) => folder.slug === slug)?.title ?? slug);
	const references = $derived(entries.filter((entry) => shell.itemOf(entry)).length);
</script>

<PageTitle {title} summary={references ? `${count(references, 'reference page')}.` : undefined} />
<EntryList {entries} />
