<!-- The front page: the site's name and description, the featured post, then every other post. -->
<script lang="ts">
	import type { ResolvedSiteConfig, VaultView } from '@svartz/core';
	import { blogPosts } from '../blog.js';
	import PostCard from './PostCard.svelte';
	import PostGrid from './PostGrid.svelte';

	let { vault, site, intro = true }: { vault: VaultView; site: ResolvedSiteConfig; intro?: boolean } = $props();

	const posts = $derived(blogPosts(vault.entries));
	const lead = $derived(posts.find((post) => post.properties.featured === true) ?? posts[0]);
	const rest = $derived(posts.filter((post) => post !== lead));
</script>

{#if intro}
	<header class="hero">
		<h1>{site.title}</h1>
		{#if site.description}<p>{site.description}</p>{/if}
	</header>
{/if}

{#if lead}
	<section class="lead" aria-label="Featured post">
		<PostCard post={lead} {vault} featured />
	</section>
{/if}

<section aria-labelledby="latest-heading">
	<h2 id="latest-heading" class="sv-label latest">Latest</h2>
	<PostGrid posts={rest} {vault} />
</section>

<style>
	.hero {
		padding-block: var(--sv-space-7) var(--sv-space-6);
		text-align: center;
	}

	.hero h1 {
		margin: 0;
		color: var(--sv-ink);
		font-size: var(--sv-step-5);
		font-weight: 700;
		letter-spacing: -0.025em;
		line-height: 1.05;
	}

	.hero p {
		max-inline-size: 36rem;
		margin: var(--sv-space-3) auto 0;
		color: var(--sv-text);
		font-size: var(--sv-step-1);
	}

	.lead {
		padding-block: var(--sv-space-6);
		border-block: var(--sv-rule-width) solid var(--sv-rule);
		margin-block-end: var(--sv-space-7);
	}

	.latest {
		margin: 0 0 var(--sv-space-4);
	}
</style>
