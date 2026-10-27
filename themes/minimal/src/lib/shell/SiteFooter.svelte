<!-- The site footer: title, author, Svartz credit, and the config's footer links. -->
<script lang="ts">
	import { themeSettings } from '@svartz/ui';
	import type { RegionProps } from '../extension.js';

	let { shell }: RegionProps = $props();

	const links = $derived(themeSettings(shell.themeConfig).footerLinks);
</script>

<div class="site-footer">
	<p>
		{[shell.site.title, shell.site.author].filter(Boolean).join(' · ')}{' · '}Published with
		<a href="https://github.com/mia-cx/svartz">Svartz</a>
	</p>
	{#if links.length > 0}
		<ul>
			{#each links as link (link.href)}
				<li><a href={link.href}>{link.label}</a></li>
			{/each}
		</ul>
	{/if}
</div>

<style>
	.site-footer {
		display: flex;
		flex-wrap: wrap;
		gap: var(--sv-space-2) var(--sv-space-5);
		justify-content: space-between;
		padding-block: var(--sv-space-5) var(--sv-space-7);
		border-block-start: var(--sv-rule-width) solid var(--sv-rule);
		color: var(--sv-muted);
		font-size: var(--sv-step--1);
	}

	p {
		margin: 0;
	}

	ul {
		display: flex;
		gap: var(--sv-space-4);
		margin: 0;
		padding: 0;
		list-style: none;
	}

	a {
		color: var(--sv-text);
		text-decoration-color: var(--sv-rule-strong);
		text-underline-offset: 0.2em;
	}

	a:hover {
		color: var(--sv-accent-text);
	}
</style>
