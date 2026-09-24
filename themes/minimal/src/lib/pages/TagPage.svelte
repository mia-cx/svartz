<script lang="ts">
	import type { ThemePageProps } from '@svartz/ui';
	import ListHeader from '../components/ListHeader.svelte';
	import PageList from '../components/PageList.svelte';
	import { notesTagged } from '../listing.js';
	import { tagHrefFor } from '../routes.js';

	let { vault, match }: ThemePageProps = $props();

	const tag = $derived(match?.params.slug ?? '');
	const notes = $derived(notesTagged(vault.entries, tag));
</script>

<ListHeader label="Tag" title="#{tag}" count="{notes.length} {notes.length === 1 ? 'note' : 'notes'}" />
<PageList {notes} tagHref={tagHrefFor(vault)} />
