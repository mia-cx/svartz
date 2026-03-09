<script lang="ts">
	import { page } from '$app/state';
	import { locales, localizeHref } from '$lib/paraglide/runtime';
	import './layout.css';

	const { children } = $props();

	const components = [
		{ href: '/backlinks', label: 'Backlinks' },
		{ href: '/breadcrumbs', label: 'Breadcrumbs' },
		{ href: '/comments', label: 'Comments' },
		{ href: '/explorer', label: 'FileTrie' },
		{ href: '/graph-panel', label: 'GraphPanel' },
		{ href: '/note-header', label: 'NoteHeader' },
		{ href: '/recent-notes', label: 'RecentNotes' },
		{ href: '/search-box', label: 'SearchBox' },
		{ href: '/table-of-contents', label: 'TableOfContents' },
	];

	const currentPath = $derived(page.url.pathname);
</script>

<div class="flex min-h-screen flex-col bg-white dark:bg-zinc-950">
	<!-- Top header -->
	<header
		class="sticky top-0 z-40 flex h-14 items-center border-b border-zinc-200 bg-white/80 px-6 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/80"
	>
		<a
			href="/"
			class="flex items-center gap-2 font-mono text-sm font-semibold text-zinc-900 dark:text-zinc-100"
		>
			<span
				class="flex size-6 items-center justify-center rounded bg-zinc-900 text-[10px] font-bold text-white dark:bg-zinc-100 dark:text-zinc-900"
			>
				UI
			</span>
			@svartz/ui
		</a>
		<span class="ml-2 rounded-full border border-zinc-200 px-2 py-0.5 text-xs text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
			Components
		</span>
	</header>

	<div class="flex flex-1">
		<!-- Sidebar -->
		<aside
			class="sticky top-14 hidden h-[calc(100vh-3.5rem)] w-56 shrink-0 overflow-y-auto border-r border-zinc-200 px-4 py-6 lg:block dark:border-zinc-800"
		>
			<p class="mb-2 px-2 text-xs font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
				Components
			</p>
			<nav aria-label="Components">
				<ul class="grid gap-0.5">
					{#each components as { href, label }}
						{@const isActive = currentPath === href || currentPath.startsWith(href + '/')}
						<li>
							<a
								{href}
								class="block rounded-md px-2 py-1.5 text-sm transition-colors {isActive
									? 'bg-zinc-100 font-medium text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100'
									: 'text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800/50 dark:hover:text-zinc-100'}"
							>
								{label}
							</a>
						</li>
					{/each}
				</ul>
			</nav>
		</aside>

		<!-- Main content -->
		<main class="flex-1 overflow-auto">
			{@render children()}
		</main>
	</div>
</div>

<div style="display:none">
	{#each locales as locale}
		<a href={localizeHref(page.url.pathname, { locale })}>{locale}</a>
	{/each}
</div>
