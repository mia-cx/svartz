<!--
	Vault search. A trigger button plus a modal <dialog> with results and, on wide
	screens, a preview of the selected note. Ctrl/⌘+K opens it; Ctrl/⌘+Shift+K
	opens it in tag mode. Mount once per page.
-->
<script lang="ts">
	import { goto } from '$app/navigation';
	import Search from '@lucide/svelte/icons/search';
	import { onMount, tick } from 'svelte';
	import { fetchPreview } from './preview.js';
	import { createSearch, excerpt, highlight, type SearchDocument, type SearchHit, type SearchOptions } from './search.js';

	let {
		documents = [],
		searchIndex,
		searchOptions = {
			fields: ['title', 'description', 'content', 'tags', 'aliases'],
			storeFields: ['slug', 'href', 'title', 'description', 'tags'],
			idField: 'id'
		},
		variant = 'field'
	}: {
		/** Published search documents with final hrefs (`vault.search`). */
		documents?: readonly SearchDocument[];
		searchIndex?: unknown;
		searchOptions?: SearchOptions;
		/** `field` reads as a search box; `icon` is a square button for tight headers. */
		variant?: 'field' | 'icon';
	} = $props();

	const WIDE_QUERY = '(min-width: 56rem)';

	let dialog = $state<HTMLDialogElement>();
	let input = $state<HTMLInputElement>();
	let previewBody = $state<HTMLDivElement>();
	let query = $state('');
	let selected = $state(0);
	let modifier = $state<string>();
	let wide = $state(false);
	let trigger = $state<HTMLButtonElement>();

	const search = $derived(createSearch(documents, searchOptions, searchIndex));
	const hits = $derived(search(query));
	const active = $derived<SearchHit | undefined>(hits[selected]);

	$effect(() => {
		if (selected >= hits.length) selected = 0;
	});

	$effect(() => {
		const hit = active;
		if (!wide || !hit || !previewBody) return;
		let cancelled = false;
		void fetchPreview(hit.href).then(({ nodes }) => {
			if (cancelled || !previewBody) return;
			previewBody.replaceChildren(...nodes);
			previewBody.scrollTop = 0;
		});
		return () => {
			cancelled = true;
		};
	});

	async function open(prefill = '') {
		if (!dialog) return;
		query = prefill;
		selected = 0;
		if (!dialog.open) dialog.showModal();
		await tick();
		input?.focus();
		input?.setSelectionRange(prefill.length, prefill.length);
	}

	function close() {
		dialog?.close();
	}

	function onClose() {
		query = '';
		previewBody?.replaceChildren();
		trigger?.focus();
	}

	function openHit(hit: SearchHit | undefined) {
		if (!hit) return;
		close();
		void goto(hit.href);
	}

	function onKeydown(event: KeyboardEvent) {
		const count = hits.length;
		if (count === 0) return;
		const step = event.key === 'ArrowDown' || (event.key === 'Tab' && !event.shiftKey) ? 1
			: event.key === 'ArrowUp' || (event.key === 'Tab' && event.shiftKey) ? -1
			: 0;
		if (step) {
			event.preventDefault();
			selected = (selected + step + count) % count;
			document.getElementById(`sv-search-hit-${selected}`)?.scrollIntoView({ block: 'nearest' });
		} else if (event.key === 'Enter') {
			event.preventDefault();
			openHit(active);
		}
	}

	onMount(() => {
		modifier = /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl';
		const media = matchMedia(WIDE_QUERY);
		wide = media.matches;
		const onMedia = () => (wide = media.matches);
		media.addEventListener('change', onMedia);

		const onShortcut = (event: KeyboardEvent) => {
			if (event.key.toLowerCase() !== 'k' || !(event.metaKey || event.ctrlKey)) return;
			event.preventDefault();
			if (dialog?.open && !event.shiftKey) close();
			else void open(event.shiftKey ? '#' : '');
		};
		window.addEventListener('keydown', onShortcut);
		return () => {
			media.removeEventListener('change', onMedia);
			window.removeEventListener('keydown', onShortcut);
		};
	});
</script>

<button
	class="sv-search-trigger"
	data-variant={variant}
	type="button"
	bind:this={trigger}
	onclick={() => open()}
	aria-label={variant === 'icon' ? 'Search' : undefined}
	aria-haspopup="dialog"
>
	<Search aria-hidden="true" />
	{#if variant === 'field'}
		<span class="sv-search-trigger-label">Search</span>
		<span class="sv-search-trigger-keys" aria-hidden="true">
			{#if modifier}<span class="sv-kbd">{modifier}</span><span class="sv-kbd">K</span>{/if}
		</span>
	{/if}
</button>

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
<dialog
	class="sv-search"
	bind:this={dialog}
	onclose={onClose}
	onclick={(event) => event.target === dialog && close()}
	aria-label="Search"
>
	<div class="sv-search-panel" data-has-results={hits.length > 0 ? '' : undefined}>
		<div class="sv-search-field">
			<Search aria-hidden="true" />
			<input
				bind:this={input}
				bind:value={query}
				onkeydown={onKeydown}
				type="text"
				role="combobox"
				aria-expanded={hits.length > 0}
				aria-controls="sv-search-results"
				aria-activedescendant={active ? `sv-search-hit-${selected}` : undefined}
				aria-autocomplete="list"
				placeholder="Search notes, or #tag"
				autocomplete="off"
				spellcheck="false"
			/>
			<button class="sv-kbd sv-search-close" type="button" onclick={close}>Esc</button>
		</div>

		{#if hits.length > 0}
			<div class="sv-search-body">
				<ul class="sv-search-results" id="sv-search-results" role="listbox" aria-label="Results">
					{#each hits as hit, index (hit.document.id)}
						<li
							id="sv-search-hit-{index}"
							role="option"
							aria-selected={index === selected}
							onpointermove={() => (selected = index)}
						>
							<a href={hit.href} tabindex="-1" onclick={close}>
								<span class="sv-search-title">
									{#each highlight(hit.document.title, hit.terms) as part, partIndex (partIndex)}
										{#if part.match}<mark>{part.text}</mark>{:else}{part.text}{/if}
									{/each}
								</span>
								{#if hit.document.content || hit.document.description}
									<span class="sv-search-excerpt">
										{#each highlight(excerpt(hit.document.content || hit.document.description || '', hit.terms, 22), hit.terms) as part, partIndex (partIndex)}
											{#if part.match}<mark>{part.text}</mark>{:else}{part.text}{/if}
										{/each}
									</span>
								{/if}
								{#if hit.document.tags?.length}
									<span class="sv-search-tags">
										{#each hit.document.tags.slice(0, 3) as tag (tag)}<span class="sv-tag">{tag}</span>{/each}
									</span>
								{/if}
							</a>
						</li>
					{/each}
				</ul>
				{#if wide}
					<div class="sv-search-preview sv-prose" bind:this={previewBody} aria-hidden="true"></div>
				{/if}
			</div>
		{:else if query.trim().length >= 2 || query.startsWith('#')}
			<p class="sv-search-empty">No notes match “{query.trim()}”.</p>
		{/if}

		<p class="sv-search-hints sv-label" aria-hidden="true">
			<span><span class="sv-kbd">↑</span><span class="sv-kbd">↓</span> move</span>
			<span><span class="sv-kbd">↵</span> open</span>
			<span><span class="sv-kbd">#</span> filter by tag</span>
		</p>
	</div>
</dialog>

<style>
	.sv-search-trigger {
		display: inline-flex;
		align-items: center;
		gap: var(--sv-space-2);
		block-size: 2.25rem;
		padding-inline: var(--sv-space-3) var(--sv-space-2);
		border: var(--sv-rule-width) solid var(--sv-rule);
		border-radius: var(--sv-radius-m);
		background: var(--sv-paper);
		color: var(--sv-muted);
		font: inherit;
		font-size: var(--sv-step--1);
		cursor: pointer;
		transition: border-color var(--sv-duration-fast) var(--sv-ease);
	}

	.sv-search-trigger:hover {
		border-color: var(--sv-rule-strong);
		color: var(--sv-text);
	}

	.sv-search-trigger[data-variant='icon'] {
		justify-content: center;
		inline-size: 2.25rem;
		padding: 0;
		border-color: transparent;
		background: transparent;
	}

	.sv-search-trigger :global(svg) {
		flex: none;
		inline-size: 1rem;
		block-size: 1rem;
	}

	.sv-search-trigger-label {
		flex: 1;
		text-align: start;
	}

	.sv-search-trigger-keys {
		display: inline-flex;
		gap: 2px;
		min-inline-size: 3.2rem;
		justify-content: end;
	}

	.sv-search {
		inline-size: min(56rem, calc(100vw - 2rem));
		max-inline-size: none;
		max-block-size: none;
		margin: 10vh auto auto;
		padding: 0;
		border: 0;
		background: transparent;
		color: var(--sv-text);
		overflow: visible;
	}

	.sv-search::backdrop {
		background: var(--sv-scrim);
		backdrop-filter: blur(3px);
	}

	.sv-search[open] {
		animation: sv-search-in var(--sv-duration) var(--sv-ease);
	}

	@keyframes sv-search-in {
		from {
			opacity: 0;
			translate: 0 -0.5rem;
		}
	}

	.sv-search-panel {
		display: grid;
		overflow: hidden;
		border: var(--sv-rule-width) solid var(--sv-rule);
		border-radius: var(--sv-radius-l);
		background: var(--sv-paper);
		box-shadow: var(--sv-shadow);
	}

	.sv-search-field {
		display: flex;
		align-items: center;
		gap: var(--sv-space-3);
		padding: var(--sv-space-3) var(--sv-space-4);
		border-block-end: var(--sv-rule-width) solid var(--sv-rule);
		color: var(--sv-muted);
	}

	.sv-search-field :global(svg) {
		flex: none;
		inline-size: 1.15rem;
		block-size: 1.15rem;
	}

	.sv-search-field input {
		flex: 1;
		min-inline-size: 0;
		padding: var(--sv-space-1) 0;
		border: 0;
		background: transparent;
		color: var(--sv-ink);
		font: inherit;
		font-size: var(--sv-step-1);
		outline: none;
		/* Host form resets (Tailwind forms) draw their own ring; the panel is the focus cue. */
		box-shadow: none;
		appearance: none;
	}

	.sv-search-field input::placeholder {
		color: var(--sv-muted);
	}

	.sv-search-close {
		cursor: pointer;
		background: transparent;
	}

	.sv-search-body {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		block-size: min(60vh, 32rem);
	}

	@media (min-width: 56rem) {
		.sv-search-body {
			grid-template-columns: minmax(16rem, 2fr) 3fr;
		}
	}

	.sv-search-results {
		margin: 0;
		padding: var(--sv-space-2);
		overflow-y: auto;
		list-style: none;
	}

	.sv-search-results li {
		border-radius: var(--sv-radius-m);
	}

	.sv-search-results li[aria-selected='true'] {
		background: var(--sv-surface);
		box-shadow: inset 2px 0 0 var(--sv-accent);
	}

	.sv-search-results a {
		display: grid;
		gap: var(--sv-space-1);
		padding: var(--sv-space-2) var(--sv-space-3);
		color: inherit;
		text-decoration: none;
	}

	.sv-search-title {
		color: var(--sv-ink);
		font-weight: 600;
	}

	.sv-search-excerpt {
		display: -webkit-box;
		overflow: hidden;
		color: var(--sv-muted);
		font-size: var(--sv-step--1);
		line-height: 1.5;
		-webkit-box-orient: vertical;
		-webkit-line-clamp: 2;
		line-clamp: 2;
	}

	.sv-search-tags {
		display: flex;
		flex-wrap: wrap;
		gap: var(--sv-space-1);
	}

	.sv-search-results mark {
		border-radius: 2px;
		background: var(--sv-mark);
		color: inherit;
	}

	.sv-search-preview {
		max-inline-size: none;
		padding: var(--sv-space-5) var(--sv-space-6);
		overflow-y: auto;
		border-inline-start: var(--sv-rule-width) solid var(--sv-rule);
		font-size: var(--sv-step--1);
	}

	.sv-search .sv-search-preview :global(h1) {
		font-size: var(--sv-step-3);
	}

	.sv-search-empty {
		margin: 0;
		padding: var(--sv-space-6) var(--sv-space-4);
		color: var(--sv-muted);
		text-align: center;
	}

	.sv-search-hints {
		display: flex;
		gap: var(--sv-space-4);
		margin: 0;
		padding: var(--sv-space-2) var(--sv-space-4);
		border-block-start: var(--sv-rule-width) solid var(--sv-rule);
		background: var(--sv-surface);
	}

	.sv-search-hints > span {
		display: inline-flex;
		align-items: center;
		gap: 3px;
	}

	@media (max-width: 40rem) {
		.sv-search {
			margin-block-start: var(--sv-space-3);
		}

		.sv-search-hints {
			display: none;
		}
	}
</style>
