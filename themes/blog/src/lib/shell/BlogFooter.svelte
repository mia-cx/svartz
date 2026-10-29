<!-- The blog's footer: the site name and description, the header and footer links, RSS, and the Svartz credit. -->
<script lang="ts">
	import type { RegionProps } from '@svartz/theme-minimal/runtime';
	import { themeSettings } from '@svartz/ui';
	import { headerLinks } from '../blog.js';

	let { shell }: RegionProps = $props();

	// A label in both lists shows once, as its header link.
	const links = $derived(
		[...headerLinks(shell), ...themeSettings(shell.themeConfig).footerLinks].filter(
			(link, index, all) => all.findIndex((other) => other.label === link.label) === index
		)
	);
	const rss = $derived(shell.site.feed ? `${shell.vault.routes.mountPath}/rss.xml` : undefined);
</script>

<div class="foot">
	<div>
		<p class="foot-title">{shell.site.title}</p>
		{#if shell.site.description}<p class="foot-description">{shell.site.description}</p>{/if}
	</div>
	<ul class="foot-links">
		{#each links as link (link.label)}<li><a href={link.href}>{link.label}</a></li>{/each}
		{#if rss}<li><a href={rss}>RSS</a></li>{/if}
	</ul>
	<p class="published">Published with <a href="https://github.com/mia-cx/svartz">Svartz</a></p>
</div>

<style>
	.foot {
		display: grid;
		grid-template-columns: 2fr 1fr;
		gap: var(--sv-space-4) var(--sv-space-6);
		padding-block: var(--sv-space-7);
		font-size: var(--sv-step--1);
	}

	p {
		margin: 0;
	}

	.foot-title {
		color: var(--sv-ink);
		font-size: var(--sv-step-1);
		font-weight: 700;
	}

	.foot-description {
		margin-block-start: var(--sv-space-2);
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
		.foot {
			grid-template-columns: 1fr;
		}
	}
</style>
