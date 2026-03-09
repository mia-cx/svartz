<script lang="ts">
	import { page } from '$app/state';
	import { locales, localizeHref } from '$lib/paraglide/runtime';
	import './layout.css';

	const { children } = $props();

	const fullPageRoutes = ['/layout', '/note'];
	const isFullPage = $derived(fullPageRoutes.includes(page.url.pathname));

	const navItems = [
		{ group: null, href: '/', label: 'Overview' },
		{ group: 'Layouts', href: '/site-layout', label: 'SiteLayout' },
		{ group: 'Pages', href: '/pages/tag-list', label: 'TagListPage' },
		{ group: 'Pages', href: '/pages/tag/demo', label: 'TagPage' },
		{ group: 'Pages', href: '/pages/folder-list', label: 'FolderListPage' },
		{ group: 'Pages', href: '/pages/folder/docs', label: 'FolderPage' },
		{ group: 'Pages', href: '/pages/feed', label: 'FeedPage' },
		{ group: 'Pages', href: '/pages/not-found', label: 'NotFoundPage' }
	];

	const groups = [
		{ label: null, items: navItems.filter((n) => n.group === null) },
		{ label: 'Layouts', items: navItems.filter((n) => n.group === 'Layouts') },
		{ label: 'Pages', items: navItems.filter((n) => n.group === 'Pages') }
	];

	const currentPath = $derived(page.url.pathname);
</script>

{#if isFullPage}
	{@render children()}
{:else}
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
					TM
				</span>
				@svartz/theme-minimal
			</a>
			<span
				class="ml-2 rounded-full border border-zinc-200 px-2 py-0.5 text-xs text-zinc-500 dark:border-zinc-700 dark:text-zinc-400"
			>
				Theme
			</span>
		</header>

		<div class="flex flex-1">
			<!-- Sidebar -->
			<aside
				class="sticky top-14 hidden h-[calc(100vh-3.5rem)] w-56 shrink-0 overflow-y-auto border-r border-zinc-200 px-4 py-6 lg:block dark:border-zinc-800"
			>
				{#each groups as group}
					{#if group.label}
						<p
							class="mb-1 mt-4 px-2 text-xs font-semibold uppercase tracking-wider text-zinc-400 first:mt-0 dark:text-zinc-500"
						>
							{group.label}
						</p>
					{/if}
					<nav aria-label={group.label ?? 'Navigation'}>
						<ul class="grid gap-0.5">
							{#each group.items as { href, label }}
								{@const isActive =
									href === '/'
										? currentPath === '/'
										: currentPath === href || currentPath.startsWith(href + '/')}
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
				{/each}
			</aside>

			<!-- Main content -->
			<main class="flex-1 overflow-auto">
				{@render children()}
			</main>
		</div>
	</div>
{/if}

<div style="display:none">
	{#each locales as locale}
		<a href={localizeHref(page.url.pathname, { locale })}>{locale}</a>
	{/each}
</div>
