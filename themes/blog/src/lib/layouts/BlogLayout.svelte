<!--
	Blog: a header with the site name and navigation, then either a post in a
	narrow reading column (cover, byline, tags, previous/next, related posts) or
	a list page. A home note renders as an intro above the post feed.
-->
<script lang="ts">
	import '@svartz/ui/base.css';
	import '@svartz/ui/prose.css';
	import { afterNavigate } from '$app/navigation';
	import { page } from '$app/state';
	import Menu from '@lucide/svelte/icons/menu';
	import X from '@lucide/svelte/icons/x';
	import {
		assetHref,
		ColorModeToggle,
		Comments,
		formatDate,
		isoDate,
		LinkPreviews,
		readingTime,
		SearchDialog,
		tagHrefFor,
		themeSettings,
		type ThemePageProps
	} from '@svartz/ui';
	import { adjacentPosts, blogPosts, postDate, readPost, relatedPosts } from '../blog.js';
	import BlogHome from '../components/BlogHome.svelte';
	import PostCard from '../components/PostCard.svelte';
	import { blogRoutes } from '../manifest.js';

	let { children, entry, vault, site, themeConfig, searchIndex, searchOptions }: ThemePageProps = $props();

	const settings = $derived(themeSettings(themeConfig));
	const prefixes = $derived(blogRoutes(themeConfig as { routes?: Record<string, string> }));
	const mount = $derived(vault.routes.mountPath);
	const homeHref = $derived(`${mount}/`);
	const tagHref = $derived(tagHrefFor(vault));
	const nav = $derived(
		settings.navLinks.length > 0
			? settings.navLinks
			: [
					{ label: 'Archive', href: `${mount}/${prefixes.feed}/` },
					{ label: 'Tags', href: `${mount}/${prefixes.tags}/` }
				]
	);
	const isFrontNote = $derived(entry?.slug === 'index');
	const post = $derived(entry && !isFrontNote ? entry : undefined);
	const meta = $derived(post ? readPost(post.properties, post.description) : undefined);
	const cover = $derived(meta?.cover ? assetHref(vault, meta.cover) : undefined);
	const date = $derived(post ? postDate(post) : undefined);
	const posts = $derived(blogPosts(vault.entries));
	const neighbours = $derived(post ? adjacentPosts(post, posts) : {});
	const related = $derived(post ? relatedPosts(post, posts) : []);
	const comments = $derived(post?.page.comments ? settings.comments : undefined);
	const rss = $derived(site.url ? `${mount}/rss.xml` : undefined);

	let menu = $state(false);
	afterNavigate(() => (menu = false));
</script>

<a class="sv-skip-link" href="#content">Skip to content</a>

<header class="site-header">
	<div class="header-inner">
		<a class="sv-wordmark" href={homeHref}>{site.title}</a>
		<nav class="nav" data-open={menu ? '' : undefined} id="blog-nav" aria-label="Main">
			<ul>
				{#each nav as link (link.href)}
					<li><a href={link.href} aria-current={page.url.pathname === link.href ? 'page' : undefined}>{link.label}</a></li>
				{/each}
			</ul>
		</nav>
		<div class="tools">
			<SearchDialog documents={vault.search} {searchIndex} {searchOptions} variant="icon" />
			<ColorModeToggle />
			<button
				class="sv-icon-button menu"
				type="button"
				aria-expanded={menu}
				aria-controls="blog-nav"
				aria-label={menu ? 'Close the menu' : 'Open the menu'}
				onclick={() => (menu = !menu)}
			>
				{#if menu}<X aria-hidden="true" />{:else}<Menu aria-hidden="true" />{/if}
			</button>
		</div>
	</div>
</header>

<main class="main" id="content" tabindex="-1">
	{#if post && meta}
		<article class="post" data-sv-preview>
			<header class="post-head">
				{#if post.tags[0]}<a class="sv-label primary-tag" href={tagHref(post.tags[0])}>{post.tags[0]}</a>{/if}
				<h1>{post.title}</h1>
				{#if meta.excerpt}<p class="excerpt">{meta.excerpt}</p>{/if}
				<p class="byline sv-label">
					{#if meta.author}<span>{meta.author}</span>{/if}
					{#if date}<time datetime={isoDate(date)}>{formatDate(date)}</time>{/if}
					<span>{readingTime(post.readingTimeMinutes)}</span>
				</p>
			</header>
			{#if cover}
				<figure class="post-cover">
					<img src={cover} alt={meta.coverAlt ?? ''} />
				</figure>
			{/if}
			<div class="sv-prose post-body">{@render children?.()}</div>
		</article>

		<footer class="post-foot">
			{#if post.tags.length > 0}
				<ul class="post-tags" aria-label="Tags">
					{#each post.tags as tag (tag)}<li><a class="sv-tag" href={tagHref(tag)}>{tag}</a></li>{/each}
				</ul>
			{/if}
			{#if comments}<Comments {...comments} />{/if}
			{#if neighbours.newer || neighbours.older}
				<nav class="adjacent" aria-label="More posts">
					{#if neighbours.older}
						<a class="adjacent-link" href={neighbours.older.href} rel="prev">
							<span class="sv-label">Older</span>{neighbours.older.title}
						</a>
					{:else}<span></span>{/if}
					{#if neighbours.newer}
						<a class="adjacent-link newer" href={neighbours.newer.href} rel="next">
							<span class="sv-label">Newer</span>{neighbours.newer.title}
						</a>
					{/if}
				</nav>
			{/if}
		</footer>

		{#if related.length > 0}
			<section class="related" aria-labelledby="related-heading">
				<h2 id="related-heading" class="sv-section-title">Related posts</h2>
				<div class="related-grid">
					{#each related as other (other.slug)}<PostCard post={other} {vault} />{/each}
				</div>
			</section>
		{/if}
	{:else if isFrontNote}
		<div class="front-note sv-prose" data-sv-preview>{@render children?.()}</div>
		<BlogHome {vault} {site} intro={false} />
	{:else}
		<div class="list-page">{@render children?.()}</div>
	{/if}
</main>

<footer class="site-foot">
	<div class="foot-inner">
		<div>
			<p class="foot-title">{site.title}</p>
			{#if site.description}<p class="foot-description">{site.description}</p>{/if}
		</div>
		<ul class="foot-links">
			{#each [...nav, ...settings.footerLinks] as link (link.href)}<li><a href={link.href}>{link.label}</a></li>{/each}
			{#if rss}<li><a href={rss}>RSS</a></li>{/if}
		</ul>
		<p class="published">Published with <a href="https://github.com/mia-cx/svartz">Svartz</a></p>
	</div>
</footer>

<LinkPreviews />

<style>
	:global(:root) {
		--sv-density: 1.15;
		--sv-ratio: 1.26;
		--sv-measure: 40rem;
	}

	.site-header {
		border-block-end: var(--sv-rule-width) solid var(--sv-rule);
	}

	.header-inner,
	.main,
	.foot-inner {
		max-inline-size: 76rem;
		margin-inline: auto;
		padding-inline: var(--sv-space-5);
	}

	.header-inner {
		display: flex;
		align-items: center;
		gap: var(--sv-space-6);
		padding-block: var(--sv-space-4);
	}

	.nav {
		flex: 1;
	}

	.nav ul {
		display: flex;
		gap: var(--sv-space-5);
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.nav a {
		color: var(--sv-text);
		font-weight: 600;
		text-decoration: none;
	}

	.nav a:hover,
	.nav a[aria-current] {
		color: var(--sv-ink);
		box-shadow: inset 0 -2px 0 var(--sv-accent);
	}

	.tools {
		display: flex;
		align-items: center;
		gap: var(--sv-space-1);
	}

	.menu {
		display: none;
	}

	.main {
		padding-block: var(--sv-space-6) var(--sv-space-8);
		outline: none;
	}

	.post-head {
		max-inline-size: 48rem;
		margin: var(--sv-space-6) auto var(--sv-space-6);
		text-align: center;
	}

	.primary-tag {
		color: var(--sv-accent-text);
		text-decoration: none;
	}

	.post-head h1 {
		margin: var(--sv-space-3) 0 0;
		color: var(--sv-ink);
		font-size: var(--sv-step-5);
		font-weight: 700;
		letter-spacing: -0.025em;
		line-height: 1.08;
		text-wrap: balance;
	}

	.excerpt {
		margin: var(--sv-space-4) 0 0;
		color: var(--sv-text);
		font-size: var(--sv-step-1);
		text-wrap: pretty;
	}

	.byline {
		display: flex;
		flex-wrap: wrap;
		justify-content: center;
		gap: var(--sv-space-3);
		margin: var(--sv-space-4) 0 0;
	}

	.post-cover {
		max-inline-size: 64rem;
		margin: 0 auto var(--sv-space-7);
	}

	.post-cover img {
		display: block;
		inline-size: 100%;
		block-size: auto;
		border-radius: var(--sv-radius-m);
	}

	.post-body,
	.front-note {
		margin-inline: auto;
	}

	/* Images in a post break out of the reading column, as in Ghost. */
	.post-body :global(p > img:only-child) {
		inline-size: min(56rem, 100vw - 2 * var(--sv-space-5));
		max-inline-size: none;
		margin-inline: 50%;
		translate: -50% 0;
	}

	.post-foot {
		display: grid;
		gap: var(--sv-space-6);
		max-inline-size: var(--sv-measure);
		margin: var(--sv-space-7) auto 0;
	}

	.post-tags {
		display: flex;
		flex-wrap: wrap;
		gap: var(--sv-space-2);
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.adjacent {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: var(--sv-space-4);
		padding-block-start: var(--sv-space-5);
		border-block-start: var(--sv-rule-width) solid var(--sv-rule);
	}

	.adjacent-link {
		display: grid;
		gap: var(--sv-space-1);
		color: var(--sv-ink);
		font-weight: 600;
		text-decoration: none;
	}

	.adjacent-link:hover {
		color: var(--sv-accent-text);
	}

	.adjacent-link.newer {
		text-align: end;
	}

	.related {
		margin-block-start: var(--sv-space-8);
		padding-block-start: var(--sv-space-6);
		border-block-start: var(--sv-rule-width) solid var(--sv-rule);
	}

	.related-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(18rem, 1fr));
		gap: var(--sv-space-6);
		margin-block-start: var(--sv-space-4);
	}

	.front-note {
		margin-block: var(--sv-space-6);
	}

	.site-foot {
		border-block-start: var(--sv-rule-width) solid var(--sv-rule);
		background: var(--sv-surface);
	}

	.foot-inner {
		display: grid;
		grid-template-columns: 2fr 1fr;
		gap: var(--sv-space-4) var(--sv-space-6);
		padding-block: var(--sv-space-7);
		font-size: var(--sv-step--1);
	}

	.foot-inner p {
		margin: 0;
	}

	.foot-title {
		color: var(--sv-ink);
		font-size: var(--sv-step-1);
		font-weight: 700;
	}

	.foot-description {
		margin-block-start: var(--sv-space-2) !important;
		max-inline-size: 32rem;
		color: var(--sv-text);
	}

	.foot-links {
		display: grid;
		gap: var(--sv-space-2);
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.foot-links a,
	.published a {
		color: var(--sv-ink);
		text-decoration: none;
	}

	.foot-links a:hover,
	.published a:hover {
		color: var(--sv-accent-text);
	}

	.published {
		grid-column: 1 / -1;
		color: var(--sv-muted);
	}

	@media (max-width: 44rem) {
		.menu {
			display: inline-grid;
		}

		.header-inner {
			flex-wrap: wrap;
			gap: var(--sv-space-2);
		}

		.header-inner .sv-wordmark {
			flex: 1;
			font-size: var(--sv-step-1);
		}

		.nav {
			display: none;
			flex-basis: 100%;
			order: 3;
		}

		.nav[data-open] {
			display: block;
		}

		.nav ul {
			flex-direction: column;
			gap: var(--sv-space-3);
			padding-block: var(--sv-space-3);
		}

		.foot-inner {
			grid-template-columns: 1fr;
		}
	}
</style>
