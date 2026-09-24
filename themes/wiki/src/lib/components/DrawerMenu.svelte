<!--
	The section menu in the phone drawer, one page at a time: the root lists the
	sections, a section opens as its own page with its pages and subfolders, and
	Back returns. `trail` is the stack of open folders; the layout binds it to
	hide the rest of the drawer while a section is open.
-->
<script lang="ts">
	import ChevronLeft from '@lucide/svelte/icons/chevron-left';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import { tick } from 'svelte';
	import { fly } from 'svelte/transition';
	import { inFolder, type MenuFolder } from '../wiki.js';

	let {
		menu,
		currentPath,
		currentSlug,
		trail = $bindable([])
	}: {
		menu: readonly MenuFolder[];
		currentPath: string;
		currentSlug: string | undefined;
		trail?: MenuFolder[];
	} = $props();

	const SLIDE_PX = 24;
	const SLIDE_MS = 180;

	let nav = $state<HTMLElement>();
	let direction = $state(1);
	const folder = $derived(trail.at(-1));
	const reduceMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
	const current = (href: string) => (href === currentPath ? 'page' : undefined);

	async function open(next: MenuFolder) {
		direction = 1;
		trail = [...trail, next];
		await tick();
		nav?.querySelector<HTMLElement>('.back')?.focus();
	}

	async function back() {
		const closed = trail.at(-1);
		direction = -1;
		trail = trail.slice(0, -1);
		await tick();
		nav?.querySelector<HTMLElement>(`[data-folder="${closed?.id}"]`)?.focus();
	}
</script>

{#snippet folderRow(target: MenuFolder)}
	<button class="row" class:current={inFolder(target.id, currentSlug)} type="button" data-folder={target.id} onclick={() => open(target)}>
		<span>{target.title}</span>
		<ChevronRight aria-hidden="true" />
	</button>
{/snippet}

<nav class="drawer-menu" aria-label="Sections" bind:this={nav}>
	{#key folder?.id}
		<div class="page" in:fly={{ x: direction * SLIDE_PX, duration: reduceMotion() ? 0 : SLIDE_MS }}>
			{#if folder}
				<button class="back" type="button" onclick={back}>
					<ChevronLeft aria-hidden="true" />
					{trail.at(-2)?.title ?? 'Menu'}
				</button>
				<h2 class="title">{folder.title}</h2>
				<ul>
					<li><a class="row" href={folder.href} aria-current={current(folder.href)}>Overview</a></li>
					{#each folder.items as item (item.id)}
						<li>
							{#if item.folder}
								{@render folderRow(item.folder)}
							{:else}
								<a class="row" href={item.href} aria-current={current(item.href)}>{item.title}</a>
							{/if}
						</li>
					{/each}
					{#if folder.more}
						<li><a class="row all" href={folder.allHref}>See all {folder.items.length + folder.more}</a></li>
					{/if}
				</ul>
			{:else}
				<h2 class="sv-section-title">Sections</h2>
				<ul>
					{#each menu as section (section.id)}<li>{@render folderRow(section)}</li>{/each}
				</ul>
			{/if}
		</div>
	{/key}
</nav>

<style>
	.drawer-menu {
		overflow-x: clip;
	}

	ul {
		display: grid;
		margin: var(--sv-space-2) 0 0;
		padding: 0;
		list-style: none;
	}

	li + li {
		border-block-start: var(--sv-rule-width) solid var(--sv-rule);
	}

	/* Full-width rows with a 44px target, like a settings list. */
	.row {
		display: flex;
		align-items: center;
		gap: var(--sv-space-3);
		inline-size: 100%;
		min-block-size: 2.75rem;
		padding: 0;
		border: 0;
		background: none;
		color: var(--sv-text);
		font: inherit;
		text-align: start;
		text-decoration: none;
		cursor: pointer;
	}

	.row :global(svg) {
		flex: none;
		margin-inline-start: auto;
		inline-size: 1.1rem;
		block-size: 1.1rem;
		color: var(--sv-muted);
	}

	.row.current,
	.row[aria-current] {
		color: var(--sv-ink);
		font-weight: 600;
	}

	.row.current::before,
	.row[aria-current]::before {
		content: '';
		align-self: stretch;
		inline-size: 2px;
		margin-inline-end: -2px;
		background: var(--sv-accent);
	}

	.row.all {
		color: var(--sv-accent-text);
		font-weight: 600;
	}

	.back {
		display: inline-flex;
		align-items: center;
		gap: var(--sv-space-1);
		min-block-size: 2.75rem;
		margin-inline-start: -0.3rem;
		padding: 0;
		border: 0;
		background: none;
		color: var(--sv-text);
		font: inherit;
		cursor: pointer;
	}

	.back :global(svg) {
		inline-size: 1.25rem;
		block-size: 1.25rem;
	}

	.title {
		margin: var(--sv-space-1) 0 0;
		color: var(--sv-ink);
		font-size: var(--sv-step-2);
		font-weight: 700;
		letter-spacing: -0.01em;
	}
</style>
