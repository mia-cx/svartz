<script lang="ts">
	let { match }: { match?: { pathname?: string } } = $props();
</script>

<section class="grid gap-4">
	<div>
		<h1 class="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">Not Found</h1>
		<p class="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
			<code class="font-mono">{match?.pathname ?? 'This route'}</code> does not exist in the active
			vault.
		</p>
	</div>
	<p>
		<a
			href="/"
			class="inline-flex items-center gap-1.5 text-sm font-medium text-blue-600 transition-colors hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
		>
			<svg
				class="size-4"
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
			Return home
		</a>
	</p>
</section>
