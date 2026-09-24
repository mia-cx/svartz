<!--
	Vault search, laid out like Quartz's: a floating input bar over a wide panel,
	result titles on the left and the selected note on the right with its matches
	highlighted. Ctrl/⌘+K opens it; Ctrl/⌘+Shift+K opens it in tag mode.
	Narrow screens drop the preview and show an excerpt under each title.
	Mount once per page.
-->
<script lang="ts">
	import { goto } from '$app/navigation';
	import Search from '@lucide/svelte/icons/search';
	import { onMount, tick } from 'svelte';
	import { fetchPreview, markTerms } from './preview.js';
	import {
		createSearch,
		excerpt,
		highlight,
		parseSearchQuery,
		type SearchDocument,
		type SearchHit,
		type SearchOptions
	} from './search.js';

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

	const WIDE_QUERY = '(min-width: 50rem)';
	const PREVIEW_SCROLL_MARGIN_PX = 48;

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
	const parsed = $derived(parseSearchQuery(query));
	// A query worth an empty state: a named tag, or two characters of text. A bare "#" is not.
	const searched = $derived(Boolean(parsed.tag) || (parsed.text.length >= 2 && !parsed.text.startsWith('#')));
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
			// As in Quartz: highlight the matches and bring the first into view.
			const first = markTerms(previewBody, hit.terms);
			previewBody.scrollTop = first ? Math.max(0, first.offsetTop - PREVIEW_SCROLL_MARGIN_PX) : 0;
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
	onclick={(event) => (event.target === dialog || event.target === event.currentTarget.firstElementChild) && close()}
	aria-label="Search"
>
	<div class="sv-search-space">
		<input
			class="sv-search-bar"
			bind:this={input}
			bind:value={query}
			onkeydown={onKeydown}
			type="text"
			role="combobox"
			aria-expanded={hits.length > 0}
			aria-controls="sv-search-results"
			aria-activedescendant={active ? `sv-search-hit-${selected}` : undefined}
			aria-autocomplete="list"
			aria-label="Search notes"
			placeholder="Search for something, or #tag"
			autocomplete="off"
			spellcheck="false"
		/>

		{#if hits.length > 0}
			<div class="sv-search-layout">
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
								{#if parsed.tag && hit.document.tags?.length}
									<span class="sv-search-tags">
										{#each hit.document.tags as tag (tag)}<span class="sv-tag">{tag}</span>{/each}
									</span>
								{/if}
								{#if !wide && (hit.document.content || hit.document.description)}
									<span class="sv-search-excerpt">
										{#each highlight(excerpt(hit.document.content || hit.document.description || '', hit.terms, 22), hit.terms) as part, partIndex (partIndex)}
											{#if part.match}<mark>{part.text}</mark>{:else}{part.text}{/if}
										{/each}
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
		{:else if searched}
			<p class="sv-search-empty">No notes match “{query.trim()}”.</p>
		{/if}
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

	/* Full-viewport dialog; the scrim is the dialog itself, the panel floats in it. */
	.sv-search {
		inline-size: 100vw;
		block-size: 100dvh;
		max-inline-size: none;
		max-block-size: none;
		margin: 0;
		padding: 0;
		border: 0;
		background: transparent;
		color: var(--sv-text);
	}

	.sv-search::backdrop {
		background: var(--sv-scrim);
		backdrop-filter: blur(4px);
	}

	.sv-search[open] .sv-search-space {
		animation: sv-search-in var(--sv-duration) var(--sv-ease);
	}

	@keyframes sv-search-in {
		from {
			opacity: 0;
			translate: 0 -0.5rem;
		}
	}

	.sv-search-space {
		display: grid;
		align-content: start;
		gap: var(--sv-space-5);
		inline-size: min(80%, 76rem);
		block-size: 100%;
		margin-inline: auto;
		padding-block-start: 12vh;
		box-sizing: border-box;
	}

	.sv-search-bar,
	.sv-search-layout,
	.sv-search-empty {
		border: var(--sv-rule-width) solid var(--sv-rule);
		border-radius: var(--sv-radius-l);
		background: var(--sv-paper);
		box-shadow: var(--sv-shadow);
	}

	.sv-search-bar {
		inline-size: 100%;
		box-sizing: border-box;
		padding: 0.6em 1em;
		color: var(--sv-ink);
		font: inherit;
		font-size: var(--sv-step-1);
		outline: none;
		/* Host form resets (Tailwind forms) draw their own ring. */
		appearance: none;
	}

	.sv-search-bar:focus-visible {
		border-color: var(--sv-rule-strong);
	}

	.sv-search-bar::placeholder {
		color: var(--sv-muted);
	}

	.sv-search-layout {
		display: flex;
		block-size: 63vh;
		overflow: hidden;
	}

	.sv-search-results {
		flex: 0 0 min(30%, 28rem);
		margin: 0;
		padding: 0;
		overflow-y: auto;
		border-inline-end: var(--sv-rule-width) solid var(--sv-rule);
		list-style: none;
	}

	.sv-search-results li {
		border-block-end: var(--sv-rule-width) solid var(--sv-rule);
	}

	.sv-search-results li[aria-selected='true'] {
		background: var(--sv-surface);
		box-shadow: inset 2px 0 0 var(--sv-accent);
	}

	.sv-search-results a {
		display: grid;
		gap: var(--sv-space-2);
		padding: var(--sv-space-4);
		color: inherit;
		text-decoration: none;
	}

	.sv-search-title {
		color: var(--sv-ink);
		font-size: var(--sv-step-1);
		font-weight: 700;
		line-height: 1.25;
	}

	.sv-search-excerpt {
		display: -webkit-box;
		overflow: hidden;
		color: var(--sv-muted);
		font-size: var(--sv-step--1);
		line-height: 1.5;
		-webkit-box-orient: vertical;
		-webkit-line-clamp: 3;
		line-clamp: 3;
	}

	.sv-search-tags {
		display: flex;
		flex-wrap: wrap;
		gap: var(--sv-space-1);
	}

	.sv-search-results mark,
	.sv-search-preview :global(.sv-search-match) {
		border-radius: 2px;
		background: var(--sv-mark);
		color: inherit;
	}

	.sv-search-preview {
		flex: 1;
		max-inline-size: none;
		padding: var(--sv-space-5) var(--sv-space-7);
		overflow-y: auto;
	}

	.sv-search .sv-search-preview :global(h1) {
		font-size: var(--sv-step-4);
	}

	.sv-search-empty {
		margin: 0;
		padding: var(--sv-space-6) var(--sv-space-4);
		color: var(--sv-muted);
		text-align: center;
	}

	/* Narrow: no preview; the results take the panel. */
	@media (max-width: 50rem) {
		.sv-search-space {
			inline-size: calc(100% - 2 * var(--sv-space-3));
			padding-block-start: var(--sv-space-3);
		}

		.sv-search-results {
			flex: 1;
			border-inline-end: 0;
		}
	}
</style>
