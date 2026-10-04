<script lang="ts">
	import type { ThemePageProps } from '@svartz/ui';
	import PageTitle from '../components/PageTitle.svelte';
	import SymbolTable from '../components/SymbolTable.svelte';

	let { vault }: ThemePageProps = $props();
</script>

<PageTitle title="API reference" summary="Every exported symbol, by kind." />
<SymbolTable entries={vault.entries} />
