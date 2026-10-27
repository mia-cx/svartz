<!-- A plain note's article head. List pages title themselves, and pages a renderer claims head themselves. -->
<script lang="ts">
	import type { RegionProps } from '@svartz/theme-minimal/runtime';
	import { PageActions } from '@svartz/ui';
	import ArticleHead from '../components/ArticleHead.svelte';

	let { shell }: RegionProps = $props();
</script>

{#if shell.entry && !shell.headed}
	<ArticleHead title={shell.entry.title} site={shell.site.title}>
		{#if shell.entry.markdownHref}<PageActions href={shell.entry.markdownHref} />{/if}
	</ArticleHead>
{/if}
