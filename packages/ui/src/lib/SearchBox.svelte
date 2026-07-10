<script lang="ts">
	import { onMount } from 'svelte';
	import MiniSearch from 'minisearch';

	type SearchDocument = {
		id: string;
		slug: string;
		title: string;
		description?: string;
		content?: string;
		tags?: readonly string[];
	};

	let {
		searchDocuments = [],
		searchIndex
	}: {
		searchDocuments?: readonly SearchDocument[];
		searchIndex?: unknown;
	} = $props();

	const options = {
		fields: ['title', 'description', 'content', 'tags'],
		storeFields: ['slug', 'title', 'description', 'tags'],
		idField: 'id'
	};

	const engine = $derived.by(() => {
		if (searchIndex) {
			return MiniSearch.loadJS(searchIndex as never, options);
		}
		if (searchDocuments.length > 0) {
			const ms = new MiniSearch(options);
			ms.addAll(searchDocuments as never[]);
			return ms;
		}
		return undefined;
	});

	let open = $state(false);
	let query = $state('');
	let selectedIndex = $state(-1);
	let inputEl = $state<HTMLInputElement | undefined>();
	let triggerEl = $state<HTMLButtonElement | undefined>();
	let dialogEl = $state<HTMLDivElement | undefined>();

	const results = $derived(
		query.trim().length < 2 || !engine
			? []
			: (engine.search(query, { prefix: true, fuzzy: 0.2 }).slice(0, 8) as unknown as SearchDocument[])
	);

	function openModal() {
		open = true;
		query = '';
		selectedIndex = -1;
	}

	function closeModal() {
		open = false;
		query = '';
		selectedIndex = -1;
		requestAnimationFrame(() => triggerEl?.focus());
	}

	function slugToHref(slug: string) {
		return slug === 'index' ? '/' : `/${slug}/`;
	}

	function navigate(result: SearchDocument) {
		window.location.href = slugToHref(result.slug);
		closeModal();
	}

	$effect(() => {
		if (open && inputEl) {
			inputEl.focus();
		}
	});

	$effect(() => {
		// Keep selectedIndex in bounds when results change
		if (selectedIndex >= results.length) selectedIndex = results.length - 1;
	});

	onMount(() => {
		function handleKeydown(e: KeyboardEvent) {
			if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
				e.preventDefault();
				if (open) closeModal();
				else openModal();
			}
		}
		window.addEventListener('keydown', handleKeydown);
		return () => window.removeEventListener('keydown', handleKeydown);
	});

	function handleModalKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			closeModal();
		} else if (e.key === 'ArrowDown') {
			e.preventDefault();
			selectedIndex = Math.min(selectedIndex + 1, results.length - 1);
		} else if (e.key === 'ArrowUp') {
			e.preventDefault();
			selectedIndex = Math.max(selectedIndex - 1, -1);
		} else if (e.key === 'Enter' && selectedIndex >= 0) {
			e.preventDefault();
			const result = results[selectedIndex];
			if (result) navigate(result);
		} else if (e.key === 'Tab' && dialogEl) {
			const focusable = [
				...dialogEl.querySelectorAll<HTMLElement>(
					'button, input, a[href], [tabindex]:not([tabindex="-1"])'
				)
			];
			const first = focusable[0];
			const last = focusable.at(-1);
			if (e.shiftKey && document.activeElement === first) {
				e.preventDefault();
				last?.focus();
			} else if (!e.shiftKey && document.activeElement === last) {
				e.preventDefault();
				first?.focus();
			}
		}
	}

	const isMac = $derived(
		typeof navigator !== 'undefined' ? /mac/i.test(navigator.platform) : false
	);
</script>

<!-- Sidebar trigger -->
<button
	bind:this={triggerEl}
	type="button"
	onclick={openModal}
	aria-label="Open search (Ctrl+K)"
	class="flex w-full items-center gap-2 rounded-md border border-zinc-200 bg-white px-3 py-2 text-left text-sm text-zinc-500 shadow-sm transition-colors hover:border-zinc-300 hover:text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400 dark:hover:border-zinc-600 dark:hover:text-zinc-300"
>
	<svg
		class="size-3.5 shrink-0"
		xmlns="http://www.w3.org/2000/svg"
		viewBox="0 0 20 20"
		fill="currentColor"
		aria-hidden="true"
	>
		<path
			fill-rule="evenodd"
			d="M9 3.5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11ZM2 9a7 7 0 1 1 12.452 4.391l3.328 3.329a.75.75 0 1 1-1.06 1.06l-3.329-3.328A7 7 0 0 1 2 9Z"
			clip-rule="evenodd"
		/>
	</svg>
	<span class="flex-1">Search...</span>
	<kbd
		class="hidden rounded border border-zinc-200 bg-zinc-100 px-1.5 py-0.5 font-mono text-[10px] text-zinc-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-400 sm:block"
	>
		{isMac ? '⌘K' : 'Ctrl+K'}
	</kbd>
</button>

<!-- Modal -->
{#if open}
	<div class="fixed inset-0 z-50 flex items-start justify-center px-3 pt-[15vh]">
		<!-- Backdrop (click to close) -->
		<button
			type="button"
			onclick={closeModal}
			aria-label="Close search"
			class="absolute inset-0 cursor-default bg-black/40 backdrop-blur-sm"
		></button>

		<!-- Dialog -->
		<div
			bind:this={dialogEl}
			role="dialog"
			aria-modal="true"
			aria-label="Search"
			tabindex="-1"
			class="relative z-10 w-full max-w-lg overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-2xl dark:border-zinc-700 dark:bg-zinc-900"
			onkeydown={handleModalKeydown}
		>
			<!-- Search input row -->
			<div class="flex items-center gap-3 border-b border-zinc-200 px-4 dark:border-zinc-700">
				<svg
					class="size-4 shrink-0 text-zinc-400"
					xmlns="http://www.w3.org/2000/svg"
					viewBox="0 0 20 20"
					fill="currentColor"
					aria-hidden="true"
				>
					<path
						fill-rule="evenodd"
						d="M9 3.5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11ZM2 9a7 7 0 1 1 12.452 4.391l3.328 3.329a.75.75 0 1 1-1.06 1.06l-3.329-3.328A7 7 0 0 1 2 9Z"
						clip-rule="evenodd"
					/>
				</svg>
				<input
					bind:this={inputEl}
					bind:value={query}
					type="search"
					placeholder="Search notes..."
					aria-label="Search notes"
					autocomplete="off"
					class="flex-1 bg-transparent py-4 text-sm text-zinc-900 placeholder-zinc-400 outline-none dark:text-zinc-100 dark:placeholder-zinc-500"
				/>
				<button
					type="button"
					onclick={closeModal}
					class="shrink-0 rounded border border-zinc-200 bg-zinc-100 px-1.5 py-0.5 font-mono text-[10px] text-zinc-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-400"
				>
					Esc
				</button>
			</div>

			<!-- Results -->
			<div class="max-h-80 overflow-y-auto py-2" role="listbox" aria-label="Search results">
				{#if query.trim().length < 2}
					<p class="px-4 py-3 text-sm text-zinc-500 dark:text-zinc-400">
						Type at least 2 characters to search…
					</p>
				{:else if results.length === 0}
					<p class="px-4 py-3 text-sm text-zinc-500 dark:text-zinc-400">No results found.</p>
				{:else}
					{#each results as result, i (result.id)}
						<button
							type="button"
							role="option"
							aria-selected={i === selectedIndex}
							onclick={() => navigate(result)}
							onmouseenter={() => (selectedIndex = i)}
							class="flex w-full flex-col gap-0.5 px-4 py-2.5 text-left transition-colors {i ===
							selectedIndex
								? 'bg-zinc-100 dark:bg-zinc-800'
								: 'hover:bg-zinc-50 dark:hover:bg-zinc-800/50'}"
						>
							<span class="text-sm font-medium text-zinc-900 dark:text-zinc-100"
								>{result.title}</span
							>
							{#if result.description}
								<span class="line-clamp-1 text-xs text-zinc-500 dark:text-zinc-400">
									{result.description}
								</span>
							{/if}
						</button>
					{/each}
				{/if}
			</div>

			<!-- Footer hint -->
			<div
				class="flex items-center gap-3 border-t border-zinc-200 px-4 py-2 dark:border-zinc-700"
			>
				<span class="text-[10px] text-zinc-400 dark:text-zinc-500"
					>↑↓ navigate · ↵ open · esc close</span
				>
			</div>
		</div>
	</div>
{/if}
