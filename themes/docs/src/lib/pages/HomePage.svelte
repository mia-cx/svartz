<!-- The home note, then one card per module. -->
<script lang="ts">
	import { count, type ThemePageProps } from '@svartz/ui';
	import { moduleSections } from '../symbols.js';

	let { vault, children }: ThemePageProps = $props();

	const modules = $derived(moduleSections(vault.entries, vault.folders));
</script>

<article class="sv-prose note-body">{@render children?.()}</article>

<section class="modules" aria-labelledby="modules-heading">
	<h2 id="modules-heading" class="sv-section-title">Browse the reference</h2>
	<ul>
		{#each modules as section (section.slug)}
			<li>
				{#if section.href}<a href={section.href} class:mono={section.symbols}>{section.title}</a>{:else}<span>{section.title}</span>{/if}
				<span class="sv-label">{count(section.entries.length, section.symbols ? 'symbol' : 'page')}</span>
			</li>
		{/each}
	</ul>
</section>

<style>
	.modules {
		margin-block-start: var(--sv-space-7);
	}

	ul {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(14rem, 1fr));
		gap: var(--sv-space-3);
		margin: var(--sv-space-3) 0 0;
		padding: 0;
		list-style: none;
	}

	li {
		position: relative;
		display: grid;
		gap: var(--sv-space-1);
		padding: var(--sv-space-4);
		border: var(--sv-rule-width) solid var(--sv-rule);
		border-radius: var(--sv-radius-m);
	}

	li:hover {
		border-color: var(--sv-ink);
	}

	a {
		color: var(--sv-ink);
		font-weight: 700;
		text-decoration: none;
	}

	a.mono {
		font-family: var(--sv-font-mono);
		font-weight: 600;
	}

	a::after {
		content: '';
		position: absolute;
		inset: 0;
	}
</style>
