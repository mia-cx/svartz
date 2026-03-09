<script lang="ts">
	type Entry = {
		slug: string;
		title: string;
	};

	let {
		currentSlug,
		entries = [],
		backlinks = {}
	}: {
		currentSlug?: string;
		entries?: readonly Entry[];
		backlinks?: Record<string, readonly string[]>;
	} = $props();

	const linkedEntries = $derived(
		(currentSlug ? backlinks[currentSlug] ?? [] : [])
			.map((slug) => entries.find((entry) => entry.slug === slug))
			.filter(Boolean) as Entry[]
	);
</script>

{#if linkedEntries.length > 0}
	<section class="grid gap-2" aria-label="Backlinks">
		<p class="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
			Backlinks
		</p>
		<ul class="grid gap-1">
			{#each linkedEntries as entry (entry.slug)}
				<li>
					<a
						href={entry.slug === 'index' ? '/' : '/' + entry.slug + '/'}
						class="flex items-center gap-1.5 text-sm text-zinc-600 transition-colors hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
					>
						<svg
							class="size-3 shrink-0 text-zinc-400 dark:text-zinc-500"
							xmlns="http://www.w3.org/2000/svg"
							viewBox="0 0 20 20"
							fill="currentColor"
							aria-hidden="true"
						>
							<path
								fill-rule="evenodd"
								d="M17 10a.75.75 0 0 1-.75.75H5.612l4.158 3.96a.75.75 0 1 1-1.04 1.08l-5.5-5.25a.75.75 0 0 1 0-1.08l5.5-5.25a.75.75 0 1 1 1.04 1.08L5.612 9.25H16.25A.75.75 0 0 1 17 10Z"
								clip-rule="evenodd"
							/>
						</svg>
						{entry.title}
					</a>
				</li>
			{/each}
		</ul>
	</section>
{/if}
