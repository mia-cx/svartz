<script lang="ts">
	import { tocCollapsedSlugs } from "./stores";

	type TocEntry = {
		depth: number;
		text: string;
		slug: string;
	};

	type TocSection = {
		slug: string;
		text: string;
		depth: number;
		children: TocEntry[];
	};

	let {
		items = [],
		activeSlug: activeSlugProp,
	}: { items?: readonly TocEntry[]; activeSlug?: string } = $props();

	let hashSlug = $state("");
	$effect(() => {
		if (typeof document === "undefined") return;
		const read = () => {
			const h = document.location.hash;
			hashSlug = h ? h.slice(1) : "";
		};
		read();
		window.addEventListener("hashchange", read);
		return () => window.removeEventListener("hashchange", read);
	});
	const activeSlug = $derived(activeSlugProp ?? hashSlug);

	const minDepth = $derived(
		items.length > 0 ? Math.min(...items.map((i) => i.depth)) : 1,
	);

	const sections = $derived.by((): TocSection[] => {
		if (items.length === 0) return [];
		const out: TocSection[] = [];
		let current: TocSection | null = null;
		for (const item of items) {
			if (item.depth === minDepth) {
				current = { slug: item.slug, text: item.text, depth: item.depth, children: [] };
				out.push(current);
			} else if (current) {
				current.children.push({ ...item });
			}
		}
		return out;
	});

	function sectionContainingSlug(slug: string): string | null {
		const idx = items.findIndex((i) => i.slug === slug);
		if (idx < 0) return null;
		const depthAt = items[idx]!.depth;
		for (let i = idx; i >= 0; i--) {
			if (items[i]!.depth === minDepth) return items[i]!.slug;
		}
		return null;
	}

	let storedCollapsed = $state<string[]>(tocCollapsedSlugs.get());
	$effect(() => {
		const unsub = tocCollapsedSlugs.subscribe((v) => {
			storedCollapsed = [...v];
		});
		return unsub;
	});

	const forceExpandedSlug = $derived(activeSlug ? sectionContainingSlug(activeSlug) : null);
	const expandedSet = $derived.by(() => {
		const collapsed = new Set(storedCollapsed);
		const expanded = new Set<string>();
		for (const s of sections) {
			if (forceExpandedSlug === s.slug || !collapsed.has(s.slug)) expanded.add(s.slug);
		}
		return expanded;
	});

	function toggleSection(slug: string) {
		const next = new Set(tocCollapsedSlugs.get());
		if (next.has(slug)) next.delete(slug);
		else next.add(slug);
		tocCollapsedSlugs.set([...next]);
	}
</script>

{#if items.length > 0}
	<nav class="grid gap-1.5" aria-label="Table of contents">
		<p class="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
			On this page
		</p>

		<ol class="grid gap-0.5">
			{#each sections as section (section.slug)}
				{@const isExpanded = expandedSet.has(section.slug) || forceExpandedSlug === section.slug}
				{@const hasChildren = section.children.length > 0}
				<li>
					{#if hasChildren}
						<div class="flex min-h-10 items-center gap-1">
							<button
								type="button"
								onclick={() => toggleSection(section.slug)}
								aria-expanded={isExpanded}
								aria-label={`${isExpanded ? 'Collapse' : 'Expand'} ${section.text}`}
								class="grid size-9 shrink-0 place-items-center rounded text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
							>
								<svg
									class="size-3 shrink-0 transition-transform {isExpanded ? 'rotate-90' : ''}"
									xmlns="http://www.w3.org/2000/svg"
									viewBox="0 0 20 20"
									fill="currentColor"
									aria-hidden="true"
								>
									<path
										fill-rule="evenodd"
										d="M8.22 5.22a.75.75 0 0 1 1.06 0l4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.75.75 0 0 1-1.06-1.06L11.94 10 8.22 6.28a.75.75 0 0 1 0-1.06Z"
										clip-rule="evenodd"
									/>
								</svg>
							</button>
							<a
								href="#{section.slug}"
								class="min-w-0 flex-1 py-2 text-xs font-medium {activeSlug === section.slug
									? 'text-zinc-900 dark:text-zinc-100'
									: 'text-zinc-600 dark:text-zinc-400'} leading-relaxed transition-colors hover:text-zinc-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-600 dark:hover:text-zinc-100"
							>
								{section.text}
							</a>
						</div>
						{#if isExpanded}
							<ul class="ml-3 border-l border-zinc-200 pl-2 dark:border-zinc-700">
								{#each section.children as child (child.slug)}
									<li class="py-0.5">
										<a
											href="#{child.slug}"
											class="block text-xs leading-relaxed {activeSlug === child.slug
												? 'text-zinc-900 dark:text-zinc-100 font-medium'
												: 'text-zinc-600 dark:text-zinc-400'} transition-colors hover:text-zinc-900 dark:hover:text-zinc-100"
										>
											{child.text}
										</a>
									</li>
								{/each}
							</ul>
						{/if}
					{:else}
						<a
							href="#{section.slug}"
							class="block py-0.5 text-xs leading-relaxed {activeSlug === section.slug
								? 'text-zinc-900 dark:text-zinc-100 font-medium'
								: 'text-zinc-600 dark:text-zinc-400'} transition-colors hover:text-zinc-900 dark:hover:text-zinc-100"
						>
							{section.text}
						</a>
					{/if}
				</li>
			{/each}
		</ol>
	</nav>
{/if}
