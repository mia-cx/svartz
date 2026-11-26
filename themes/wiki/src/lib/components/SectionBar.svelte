<!--
	The section bar in the wiki header, built from the vault's folders. Each
	top-level folder links to its page and drops down its pages; a subfolder in a
	dropdown opens a flyout. Sections that don't fit the bar's width wait in a
	More menu at its end, each opening its pages as a flyout. Mouse hover opens
	menus, the chevrons open them by click, tap, or keyboard, and Esc or a tap
	elsewhere closes them. A panel that would run past the viewport opens the
	other way. Without JavaScript the folder links still work.
-->
<script lang="ts">
	import { afterNavigate } from '$app/navigation';
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import type { MenuFolder } from '../wiki.js';

	let {
		menu,
		currentPath,
		currentFolders
	}: {
		menu: readonly MenuFolder[];
		currentPath: string;
		/** The folder ids above the page (the shell's `trail`), for highlighting its section. */
		currentFolders: readonly string[];
	} = $props();

	const MORE = 'more';

	let nav = $state<HTMLElement>();
	/** An invisible copy of the bar's sections and More button, always all there to measure. */
	let probe = $state<HTMLElement>();

	/** How many sections the bar shows; the rest wait in More. Unknown until the bar has measured itself. */
	let shown = $state<number>();
	const visible = $derived(shown === undefined ? menu : menu.slice(0, shown));
	const overflow = $derived(shown === undefined ? [] : menu.slice(shown));

	let open = $state<string>();
	let flyout = $state<string>();
	afterNavigate(() => {
		open = undefined;
		flyout = undefined;
	});

	/** As many sections as fit, keeping room for More whenever any are left over. */
	function fit() {
		if (!nav || !probe) return;
		const [more, ...sections] = [...probe.children].map((item) => (item as HTMLElement).offsetWidth);
		const gap = parseFloat(getComputedStyle(probe).columnGap) || 0;
		let used = 0;
		let count = 0;
		for (const [index, width] of sections.entries()) {
			const end = used + (index > 0 ? gap : 0) + width;
			const rest = index < sections.length - 1 ? gap + more! : 0;
			if (end + rest > nav.clientWidth) break;
			used = end;
			count += 1;
		}
		shown = count;
	}

	$effect(() => {
		if (!nav || !probe) return;
		// The bar's width, and the sections' widths once fonts load, both change what fits.
		const observer = new ResizeObserver(fit);
		observer.observe(nav);
		observer.observe(probe);
		return () => observer.disconnect();
	});

	const current = (href: string) => (href === currentPath ? 'page' : undefined);

	/** Runs `action` for mouse pointers only; touch and pen use the chevrons. */
	const withMouse = (event: PointerEvent, action: () => void) => {
		if (event.pointerType === 'mouse') action();
	};

	/** A mouse click keeps a hover-opened menu open; keyboard and touch toggle it. */
	const toggled = (event: MouseEvent, id: string, active: string | undefined) =>
		(event as PointerEvent).pointerType === 'mouse' || active !== id ? id : undefined;

	/** Touch browsers don't always move focus on tap, so a tap outside closes menus too. */
	function closeOnOutsidePointer(event: PointerEvent) {
		if (nav && !nav.contains(event.target as Node)) open = flyout = undefined;
	}

	/** Flips an open panel to the other side when it would run past the viewport's right edge. */
	function keepInView(panel: HTMLElement, isOpen: boolean) {
		// Measured next frame (still before paint): the `hidden` update may not have landed yet.
		const place = (isOpen: boolean) => {
			delete panel.dataset.flip;
			if (!isOpen) return;
			requestAnimationFrame(() => {
				if (panel.getBoundingClientRect().right > document.documentElement.clientWidth) panel.dataset.flip = '';
			});
		};
		place(isOpen);
		return { update: place };
	}

	function closeOnFocusOut(event: FocusEvent, close: () => void) {
		const item = event.currentTarget as HTMLElement;
		if (!item.contains(event.relatedTarget as Node | null)) close();
	}

	/** Esc closes the innermost open menu and returns focus to its chevron. */
	function closeOnEscape(event: KeyboardEvent, isOpen: boolean, close: () => void) {
		if (event.key !== 'Escape' || !isOpen) return;
		event.stopPropagation();
		close();
		(event.currentTarget as HTMLElement).querySelector<HTMLButtonElement>(':scope > .toggle')?.focus();
	}

	const closeTop = (id: string) => () => {
		if (open === id) open = flyout = undefined;
	};
</script>

<svelte:window onpointerdown={closeOnOutsidePointer} />

<!-- A folder in a panel that opens its own pages as a flyout: a subfolder in a dropdown, or a section in More. -->
{#snippet folderItem(folder: MenuFolder, panelId: string)}
	{@const closeFlyout = () => {
		if (flyout === folder.id) flyout = undefined;
	}}
	<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
	<li
		class="item has-flyout"
		class:current={currentFolders.includes(folder.id)}
		onpointerenter={(event) => withMouse(event, () => (flyout = folder.id))}
		onpointerleave={(event) => withMouse(event, closeFlyout)}
		onfocusout={(event) => closeOnFocusOut(event, closeFlyout)}
		onkeydown={(event) => closeOnEscape(event, flyout === folder.id, closeFlyout)}
	>
		<a href={folder.href} aria-current={current(folder.href)}>{folder.title}</a>
		<button
			class="toggle"
			type="button"
			aria-expanded={flyout === folder.id}
			aria-controls={panelId}
			aria-label="{folder.title} pages"
			onclick={(event) => (flyout = toggled(event, folder.id, flyout))}
		>
			<ChevronRight aria-hidden="true" />
		</button>
		<ul class="panel flyout" id={panelId} hidden={flyout !== folder.id} use:keepInView={flyout === folder.id}>
			{#each folder.items as leaf (leaf.id)}
				<li class="item"><a href={leaf.href} aria-current={current(leaf.href)}>{leaf.title}</a></li>
			{/each}
			{#if folder.more}
				<li class="item all"><a href={folder.allHref}>See all {folder.items.length + folder.more}</a></li>
			{/if}
		</ul>
	</li>
{/snippet}

<nav class="sections" aria-label="Sections" bind:this={nav}>
	<ul class="bar" class:measured={shown !== undefined}>
		{#each visible as folder, index (folder.id)}
			<!-- The item only delegates hover, focus-out, and Esc; its link and button are the controls. -->
			<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
			<li
				class="top"
				class:current={currentFolders.includes(folder.id)}
				onpointerenter={(event) => withMouse(event, () => (open = folder.id))}
				onpointerleave={(event) => withMouse(event, closeTop(folder.id))}
				onfocusout={(event) => closeOnFocusOut(event, closeTop(folder.id))}
				onkeydown={(event) => closeOnEscape(event, open === folder.id, closeTop(folder.id))}
			>
				<a href={folder.href} aria-current={current(folder.href)}>{folder.title}</a>
				<button
					class="toggle"
					type="button"
					aria-expanded={open === folder.id}
					aria-controls="wiki-sections-{index}"
					aria-label="{folder.title} pages"
					onclick={(event) => (open = toggled(event, folder.id, open))}
				>
					<ChevronDown aria-hidden="true" />
				</button>
				<ul class="panel dropdown" id="wiki-sections-{index}" hidden={open !== folder.id} use:keepInView={open === folder.id}>
					{#each folder.items as item, itemIndex (item.id)}
						{#if item.folder}
							{@render folderItem(item.folder, `wiki-sections-${index}-${itemIndex}`)}
						{:else}
							<li class="item"><a href={item.href} aria-current={current(item.href)}>{item.title}</a></li>
						{/if}
					{/each}
					{#if folder.more}
						<li class="item all"><a href={folder.allHref}>See all {folder.items.length + folder.more}</a></li>
					{/if}
				</ul>
			</li>
		{/each}
		{#if overflow.length > 0}
			<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
			<li
				class="top more"
				class:current={overflow.some((folder) => currentFolders.includes(folder.id))}
				onpointerenter={(event) => withMouse(event, () => (open = MORE))}
				onpointerleave={(event) => withMouse(event, closeTop(MORE))}
				onfocusout={(event) => closeOnFocusOut(event, closeTop(MORE))}
				onkeydown={(event) => closeOnEscape(event, open === MORE, closeTop(MORE))}
			>
				<button
					class="toggle more-toggle"
					type="button"
					aria-expanded={open === MORE}
					aria-controls="wiki-sections-more"
					onclick={(event) => (open = toggled(event, MORE, open))}
				>
					More<ChevronDown aria-hidden="true" />
				</button>
				<ul class="panel dropdown" id="wiki-sections-more" hidden={open !== MORE} use:keepInView={open === MORE}>
					{#each overflow as folder, index (folder.id)}
						{@render folderItem(folder, `wiki-sections-more-${index}`)}
					{/each}
				</ul>
			</li>
		{/if}
	</ul>
	<!-- Measured, never seen: More first, then every section as the bar would show it. -->
	<ul class="bar probe" aria-hidden="true" inert bind:this={probe}>
		<li class="top"><span class="toggle more-toggle">More<ChevronDown /></span></li>
		{#each menu as folder (folder.id)}
			<li class="top"><span class="label">{folder.title}</span><span class="toggle"><ChevronDown /></span></li>
		{/each}
	</ul>
</nav>

<style>
	.sections {
		position: relative;
		block-size: 100%;
	}

	.bar {
		display: flex;
		gap: 0 var(--sv-space-3);
		block-size: 100%;
		margin: 0;
		padding: 0;
		list-style: none;
		font-size: var(--sv-step--1);
		white-space: nowrap;
	}

	/* Until the bar knows what fits, the sections past its edge stay out of sight instead of under the search. */
	.bar:not(.measured) {
		overflow-x: clip;
	}

	.probe {
		position: absolute;
		inset-block-start: 0;
		inset-inline-start: 0;
		visibility: hidden;
		pointer-events: none;
	}

	.top {
		position: relative;
		display: flex;
		align-items: center;
	}

	.top > a,
	.top > .label {
		display: flex;
		align-items: center;
		align-self: stretch;
		font-weight: 600;
	}

	.top > a {
		color: var(--sv-text);
		text-decoration: none;
	}

	.top > a:hover,
	.top.current > a,
	.top.current > .more-toggle {
		color: var(--sv-ink);
	}

	/* The section you're in carries the accent along the header's rule, like the current row in the rail. */
	.top.current > a,
	.top.current > .more-toggle {
		box-shadow: inset 0 -2px 0 var(--sv-accent);
	}

	.toggle {
		display: inline-grid;
		place-items: center;
		inline-size: 1.5rem;
		block-size: 1.5rem;
		padding: 0;
		border: 0;
		border-radius: var(--sv-radius-s);
		background: none;
		color: var(--sv-muted);
		cursor: pointer;
	}

	.toggle:hover {
		background: var(--sv-surface);
		color: var(--sv-ink);
	}

	.toggle :global(svg) {
		inline-size: 0.95rem;
		block-size: 0.95rem;
		transition: rotate var(--sv-duration) var(--sv-ease);
	}

	.top > .toggle[aria-expanded='true'] :global(svg) {
		rotate: 180deg;
	}

	/* More reads like a section: its label and chevron in one button. */
	.more-toggle {
		display: inline-flex;
		align-items: center;
		align-self: stretch;
		gap: var(--sv-space-1);
		inline-size: auto;
		block-size: auto;
		padding-inline: 0;
		border-radius: 0;
		color: var(--sv-text);
		font: inherit;
		font-weight: 600;
	}

	.more-toggle:hover {
		background: none;
	}

	.panel {
		position: absolute;
		z-index: var(--sv-z-popover);
		min-inline-size: 13rem;
		max-inline-size: 20rem;
		margin: 0;
		padding: var(--sv-space-1);
		border: var(--sv-rule-width) solid var(--sv-rule);
		border-radius: var(--sv-radius-m);
		background: var(--sv-paper);
		box-shadow: var(--sv-shadow);
		list-style: none;
		white-space: normal;
	}

	.dropdown {
		inset-block-start: 100%;
		inset-inline-start: calc(-1 * var(--sv-space-3));
	}

	.flyout {
		inset-block-start: calc(-1 * (var(--sv-space-1) + var(--sv-rule-width)));
		inset-inline-start: calc(100% + var(--sv-space-1) + var(--sv-rule-width));
	}

	/* Near the right edge: the dropdown aligns to its item's end, the flyout opens left. */
	.dropdown:global([data-flip]) {
		inset-inline: auto calc(-1 * var(--sv-space-3));
	}

	.flyout:global([data-flip]) {
		inset-inline: auto calc(100% + var(--sv-space-1) + var(--sv-rule-width));
	}

	.item {
		position: relative;
		display: flex;
		align-items: center;
		border-radius: var(--sv-radius-s);
	}

	/* Bridges the panel's padding so the pointer can reach the flyout. */
	.has-flyout::after {
		content: '';
		position: absolute;
		inset-block: 0;
		inset-inline-start: 100%;
		inline-size: calc(var(--sv-space-1) + var(--sv-rule-width));
	}

	.has-flyout:has(> .flyout:global([data-flip]))::after {
		inset-inline: auto 100%;
	}

	.item:hover,
	.item:focus-within {
		background: var(--sv-surface);
	}

	.item > a {
		flex: 1;
		overflow: hidden;
		padding: var(--sv-space-2) var(--sv-space-3);
		color: var(--sv-text);
		text-decoration: none;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.item:hover > a,
	.item > a[aria-current],
	.item.current > a {
		color: var(--sv-ink);
	}

	.item > a[aria-current],
	.item.current > a {
		font-weight: 600;
	}

	.item > .toggle {
		margin-inline-end: var(--sv-space-1);
	}

	.all > a {
		color: var(--sv-accent-text);
		font-weight: 600;
	}
</style>
