<!--
	The section bar under the wiki header, built from the vault's folders. Each
	top-level folder links to its page and drops down its pages; a subfolder in a
	dropdown opens a flyout. Mouse hover opens menus, the chevrons open them by
	click, tap, or keyboard, and Esc or a tap elsewhere closes them. A panel that
	would run past the viewport opens the other way. Without JavaScript the
	folder links still work.
-->
<script lang="ts">
	import { afterNavigate } from '$app/navigation';
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import { inFolder, type MenuFolder } from '../wiki.js';

	let {
		menu,
		currentPath,
		currentSlug
	}: {
		menu: readonly MenuFolder[];
		currentPath: string;
		/** The page's note or folder slug, for highlighting its section. */
		currentSlug: string | undefined;
	} = $props();

	let nav = $state<HTMLElement>();

	let open = $state<string>();
	let flyout = $state<string>();
	afterNavigate(() => {
		open = undefined;
		flyout = undefined;
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
</script>

<svelte:window onpointerdown={closeOnOutsidePointer} />

<nav class="sections" aria-label="Sections" bind:this={nav}>
	<ul class="bar">
		{#each menu as folder, index (folder.id)}
			{@const closeTop = () => {
				if (open === folder.id) open = flyout = undefined;
			}}
			<!-- The item only delegates hover, focus-out, and Esc; its link and button are the controls. -->
			<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
			<li
				class="top"
				class:current={inFolder(folder.id, currentSlug)}
				onpointerenter={(event) => withMouse(event, () => (open = folder.id))}
				onpointerleave={(event) => withMouse(event, closeTop)}
				onfocusout={(event) => closeOnFocusOut(event, closeTop)}
				onkeydown={(event) => closeOnEscape(event, open === folder.id, closeTop)}
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
				<ul
					class="panel dropdown"
					id="wiki-sections-{index}"
					hidden={open !== folder.id}
					use:keepInView={open === folder.id}
				>
					{#each folder.items as item, itemIndex (item.id)}
						{#if item.folder}
							{@const closeFlyout = () => {
								if (flyout === item.id) flyout = undefined;
							}}
							<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
							<li
								class="item has-flyout"
								onpointerenter={(event) => withMouse(event, () => (flyout = item.id))}
								onpointerleave={(event) => withMouse(event, closeFlyout)}
								onfocusout={(event) => closeOnFocusOut(event, closeFlyout)}
								onkeydown={(event) => closeOnEscape(event, flyout === item.id, closeFlyout)}
							>
								<a href={item.href} aria-current={current(item.href)}>{item.title}</a>
								<button
									class="toggle"
									type="button"
									aria-expanded={flyout === item.id}
									aria-controls="wiki-sections-{index}-{itemIndex}"
									aria-label="{item.title} pages"
									onclick={(event) => (flyout = toggled(event, item.id, flyout))}
								>
									<ChevronRight aria-hidden="true" />
								</button>
								<ul
									class="panel flyout"
									id="wiki-sections-{index}-{itemIndex}"
									hidden={flyout !== item.id}
									use:keepInView={flyout === item.id}
								>
									{#each item.folder.items as leaf (leaf.id)}
										<li class="item"><a href={leaf.href} aria-current={current(leaf.href)}>{leaf.title}</a></li>
									{/each}
									{#if item.folder.more}
										<li class="item all"><a href={item.folder.allHref}>See all {item.folder.items.length + item.folder.more}</a></li>
									{/if}
								</ul>
							</li>
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
	</ul>
</nav>

<style>
	.bar {
		display: flex;
		flex-wrap: wrap;
		gap: 0 var(--sv-space-3);
		margin: 0;
		padding: 0;
		list-style: none;
		font-size: var(--sv-step--1);
	}

	.top {
		position: relative;
		display: flex;
		align-items: center;
	}

	.top > a {
		padding-block: var(--sv-space-2);
		color: var(--sv-text);
		font-weight: 600;
		text-decoration: none;
	}

	.top > a:hover,
	.top.current > a {
		color: var(--sv-ink);
	}

	/* The section you're in carries the accent, like the current row in the rail. */
	.top.current > a {
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
	.item > a[aria-current] {
		color: var(--sv-ink);
	}

	.item > a[aria-current] {
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
