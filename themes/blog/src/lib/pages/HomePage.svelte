<script lang="ts">
	import type { ThemePageProps } from '@svartz/ui';
	import BlogHome from '../components/BlogHome.svelte';

	let { vault, site }: ThemePageProps = $props();
</script>

<BlogHome {vault} {site} />
