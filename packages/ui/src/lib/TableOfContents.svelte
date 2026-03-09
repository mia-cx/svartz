<script lang="ts">
	type TocEntry = {
		depth: number;
		text: string;
		slug: string;
	};

	let { items = [] }: { items?: readonly TocEntry[] } = $props();

	let open = $state(false);
</script>

{#if items.length > 0}
	<nav aria-label="Table of contents">
		<button
			type="button"
			onclick={() => (open = !open)}
			aria-expanded={open}
			class="flex w-full items-center justify-between rounded px-0 py-0 text-xs font-semibold uppercase tracking-wider text-zinc-500 transition-colors hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
		>
			On this page
			<svg
				class="size-3 transition-transform {open ? 'rotate-180' : ''}"
				xmlns="http://www.w3.org/2000/svg"
				viewBox="0 0 20 20"
				fill="currentColor"
				aria-hidden="true"
			>
				<path
					fill-rule="evenodd"
					d="M5.22 8.22a.75.75 0 0 1 1.06 0L10 11.94l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L5.22 9.28a.75.75 0 0 1 0-1.06Z"
					clip-rule="evenodd"
				/>
			</svg>
		</button>

		{#if open}
			<ol class="mt-2 grid gap-1">
				{#each items as item (item.slug)}
					<li style="padding-left: {(item.depth - 1) * 0.75}rem">
						<a
							href="#{item.slug}"
							class="block text-xs leading-relaxed text-zinc-600 transition-colors hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
						>
							{item.text}
						</a>
					</li>
				{/each}
			</ol>
		{/if}
	</nav>
{/if}
