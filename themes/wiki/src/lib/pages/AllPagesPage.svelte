<script lang="ts">
	import { count, type ThemePageProps } from '@svartz/ui';
	import AzList from '../components/AzList.svelte';
	import PageTitle from '../components/PageTitle.svelte';

	let { vault }: ThemePageProps = $props();
</script>

<PageTitle title="All pages" summary="{count(vault.entries.length, 'page')} in this wiki." />
<AzList notes={vault.entries} />
